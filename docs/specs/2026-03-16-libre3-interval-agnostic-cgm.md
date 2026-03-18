# Interval-Agnostic CGM Support (Libre 3 Migration)

**Date:** 2026-03-16
**Status:** Draft
**Trigger:** Switching from Dexcom/xDrip+ (5-min readings) to Freestyle Libre 3 (1-min readings)

## Goal

Support 1-minute CGM data from Freestyle Libre 3 without losing resolution. The system should be interval-agnostic: detect the CGM interval from actual data and propagate it through all layers.

## Design Principles

1. **1-minute data everywhere possible.** SugarRun (data field during activity) updates at 1-minute cadence. SugarWave and SuperStable are watchfaces — Garmin's `registerForTemporalEvent` enforces a 5-minute minimum for background fetches. They show the latest available reading on each refresh but can't poll faster. This is a Garmin SDK limitation, not a design choice.
2. **Per-minute is the internal unit.** All rates (BG drop, entry slope, delta) are stored and computed as mmol/L per minute or mg/dL per minute internally.
3. **Detect, don't configure.** Interval is detected from the time gap between consecutive readings. No user setting needed.
4. **BG model observation windows stay at 5 minutes.** This is internal to the model — never displayed. A 5-min window with 5 glucose points gives better line-fitting than one with 1 point. The model benefits from denser data within the same analysis window.

## Scope

### Repos affected

| Repo | Impact | Priority |
|------|--------|----------|
| Springa | BG model, xDrip ingestion, simulation, pre-run, report card, AI prompts | P0 |
| SugarRun | Delta normalization, direction arrows, stale detection | P0 |
| SugarWave | Delta normalization, direction arrows, poll interval, fetch count, predictions | P0 |
| SuperStable | Background fetch timing, fetch count (detection already exists) | P1 |

---

## Springa Changes

### 1. Internal unit: per-minute

Every `bgRate`, `dropRate`, `entrySlope`, and `deltaPer5min` field switches to per-minute.

**Type changes:**

```typescript
// Before
bgRate: number;          // mmol/L per 5 min
entrySlope30m: number;   // mmol/L per 5 min
dropRatePer5m: number;

// After
bgRate: number;          // mmol/L per min
entrySlope30m: number;   // mmol/L per min
dropRate: number;        // mmol/L per min
```

**Files:**
- `lib/bgModel.ts` — `BGObservation.bgRate`, `CategoryStats.avgRate`, `computeEntrySlope()`, `classifyEntrySlope()` thresholds
- `lib/bgObservations.ts` — rate calculation in `extractObservations()`
- `lib/runBGContext.ts` — `entrySlope30m`, `computeSlope()`
- `lib/bgPatterns.ts` — `dropRatePer5m` field and AI prompt text
- `lib/reportCard.ts` — drop rate calculation and display thresholds
- `lib/runLine.ts` — display labels
- `lib/coachContext.ts` — rate unit in coach prompt
- `lib/bgSimulation.ts` — `STEP_MIN`, `EXTRAPOLATION_FACTOR`, rate scaling

### 2. xDrip ingestion (`lib/cgm.ts`)

**Delta normalization** (line 117):
```typescript
// Before
const deltaPer5min = rawDelta / (dtMs / 300000);

// After
const deltaPerMin = rawDelta / (dtMs / 60000);
```

**Direction thresholds** (`directionFromDelta`, lines 92-99):

Current thresholds are mg/dL per 5 min. Divide by 5 for per-minute:

| Direction | Per 5 min | Per minute |
|-----------|-----------|------------|
| DoubleDown | <= -17.5 | <= -3.5 |
| SingleDown | <= -10.0 | <= -2.0 |
| FortyFiveDown | <= -5.0 | <= -1.0 |
| Flat | <= 5.0 | <= 1.0 |
| FortyFiveUp | <= 10.0 | <= 2.0 |
| SingleUp | <= 17.5 | <= 3.5 |
| DoubleUp | > 17.5 | > 3.5 |

**`recomputeDirections()`** — currently computes `slopePer5 = slopePerMin * 5`. Change to pass `slopePerMin` directly.

**Gap detection** (line 111): `dtMs > 600000` (10 min) — keep as-is. A 10-min gap is unreliable regardless of CGM interval.

### 3. BG observation extraction (`lib/bgObservations.ts`)

**Window size stays at 5 minutes.** The sliding window still covers a 5-min span, but with 1-min data there are ~5 glucose points per window instead of ~1.

```typescript
const WINDOW_SIZE = 5; // minutes — unchanged

// Before
const bgRate = ((gEnd - gStart) / WINDOW_SIZE) * 5; // per 5 min

// After
const bgRate = (gEnd - gStart) / WINDOW_SIZE; // per min (mmol/L change over 5 min, divided by 5)
```

This is the same math — just drop the `* 5` multiplier. The rate becomes "average mmol/L per minute over the 5-min window."

**Improvement opportunity:** With 5 points per window, fit a least-squares line instead of endpoint-to-endpoint. Less sensitive to single noisy readings. Not required for launch but worth noting.

### 4. BG simulation (`lib/bgSimulation.ts`)

**Step size** becomes 1 minute:
```typescript
// Before
const STEP_MIN = 5;

// After
const STEP_MIN = 1;
```

This gives 5x smoother prediction curves. Rate scaling `rate * (STEP_MIN / 5)` was a no-op before — now it needs to use the rate directly since rates are already per-minute.

**Extrapolation factor** (line 56):
```typescript
// Before: 12 g/h per 1.0 mmol/L per 5 min
const EXTRAPOLATION_FACTOR = 12;

// After: 12 g/h per 0.2 mmol/L per min (same physical relationship)
// 1.0 mmol/L/5min = 0.2 mmol/L/min → factor = 12 / 0.2 = 60
const EXTRAPOLATION_FACTOR = 60;
```

### 5. Pre-run readiness (`lib/prerun.ts`)

**Slope thresholds** — currently in per-5-min, divide by 5:

```typescript
// Before
if (slope < -0.25) // wait
if (slope <= -0.15) // caution
const predictedDrop = trendSlope * 6; // 6 five-min windows = 30 min

// After
if (slope < -0.05) // wait (-0.25 / 5)
if (slope <= -0.03) // caution (-0.15 / 5)
const predictedDrop = trendSlope * 30; // 30 one-min windows = 30 min
```

**Benefit:** With 1-min data, entry slope is computed over more data points. Less noisy, fewer false positives. May want to tighten thresholds after calibration.

### 6. Report card (`lib/reportCard.ts`)

```typescript
// Before
const duration5m = durationMin / 5;
const dropRate = duration5m > 0 ? (lastBG - startBG) / duration5m : 0;

// After
const dropRate = durationMin > 0 ? (lastBG - startBG) / durationMin : 0;
```

Update display thresholds (good/ok/bad) to per-minute scale (divide current thresholds by 5).

### 7. AI prompts (`lib/bgPatterns.ts`, `lib/coachContext.ts`)

Update field names and prompt context:
- `dropRatePer5m` → `dropRatePerMin`
- Prompt text: "mmol/L per 5 min" → "mmol/L per min"
- CSV headers in pattern analysis

### 8. Tests

- `lib/__tests__/fixtures/bgReadings.ts` — change `i * 5 * 60 * 1000` to `i * 60 * 1000`
- Update all assertion values (rates are 1/5th of current values)
- Add test cases for mixed-interval data (gaps, sensor restarts)

---

## Garmin Changes

### SugarRun

**Delta normalization** (`CgmService.mc:107`):
```monkeyc
// Before
mDeltaMgdl = rawDelta / (dtMs.toFloat() / 300000.0f);

// After
mDeltaMgdl = rawDelta / (dtMs.toFloat() / 60000.0f);
```

**Direction thresholds** (`Conversions.mc:66-72`):

Update to per-minute scale: [±3.0, ±2.0, ±1.1] mg/dL per minute (EASD/ISPAD 2020).

**Stale thresholds** (`Conversions.mc:31,89`):
```monkeyc
// Before
if (minutes < 5) { return Graphics.COLOR_WHITE; }
if (minutes < STALE_MINUTES) { return COLOR_STALE_WARNING; } // STALE_MINUTES = 10

// After
if (minutes < 3) { return Graphics.COLOR_WHITE; }
if (minutes < 6) { return COLOR_STALE_WARNING; }
```

**Mock data** (`CgmService.mc:42`): `300000l` → `60000l`

### SugarWave

**Delta normalization** (`SugarWaveView.mc:762,953,1127`):

Same fix as SugarRun — `300000.0f` → `60000.0f`.

**Time-to-threshold prediction** (`SugarWaveView.mc:853`):
```monkeyc
// Before
var deltaMmolPerMin = deltaMmol / 5.0f;

// After — deltaMmol is already per minute after the normalization fix
var deltaMmolPerMin = deltaMmol;
```

**Poll interval** (`SugarWaveApp.mc:56-70`):

Watchface background services are locked to 5-min minimum by Garmin SDK. Keep `wait = 300`. When the fetch fires, request enough readings to cover the full 5-min gap (see fetch count below).

**Fetch count** (`SugarWaveBgService.mc:15`):
```monkeyc
// Before: 72 readings * 5 min = 6 hours
count=72

// After: 360 readings * 1 min = 6 hours
count=360
```

**Stale thresholds** (`Conversions.mc:98-102`): Same adjustment as SugarRun.

**Graph rendering** (`SugarWaveView.mc:34`): With 5x more data points, consider downsampling for display (every Nth point) or adjusting dot size. The graph duration (60 min default) can stay — it'll just have denser data.

**Direction thresholds** (`Conversions.mc:76-83`): Same per-minute scale as SugarRun.

### SuperStable

Already has interval detection (`CGMWatchfaceView.mc:279-292`). Remaining fixes:

**Background fetch** (`CGMWatchfaceApp.mc:113,142-166`):

Use the detected `minutes` variable to set fetch interval:
```monkeyc
// Before
var nextTime = lastTime.add(new Time.Duration(5 * 60));

// After
var interval = (minutes != null && minutes == 1) ? 60 : 300;
var nextTime = lastTime.add(new Time.Duration(interval));
```

Propagate `minutes` through the `calcDuration` logic (lines 142-166) — replace hardcoded `300` with `minutes * 60`.

**Fetch count** (`CGMWatchfaceBG.mc:52`):

Make count dynamic based on detected interval:
```monkeyc
// 18 readings at 5 min = 90 min; equivalent at 1 min = 90 readings
var count = (minutes == 1) ? 90 : 18;
```

---

## Migration Strategy

### Phase 1: Springa ingestion layer (can ship alone)

1. Update `cgm.ts` — delta normalization and direction thresholds to per-minute
2. Update `bgObservations.ts` — drop the `* 5` multiplier
3. Update all type comments to say "per min"
4. Update tests

This breaks the downstream display (rates will be 1/5th of expected) but the data pipeline is correct.

### Phase 2: Springa consumers

4. `bgModel.ts` — threshold adjustments, `computeEntrySlope()`, `classifyEntrySlope()`
5. `bgSimulation.ts` — `STEP_MIN = 1`, `EXTRAPOLATION_FACTOR` adjustment
6. `prerun.ts` — slope thresholds
7. `reportCard.ts` — drop rate calculation, display thresholds
8. `runBGContext.ts` — slope computation
9. `bgPatterns.ts`, `coachContext.ts` — AI prompt updates
10. `runLine.ts` — display labels

### Phase 3: Garmin apps (independent, can parallel)

11. SugarRun — delta, thresholds, stale
12. SugarWave — delta, thresholds, poll interval, fetch count, prediction
13. SuperStable — background fetch timing, fetch count

### Phase 4: Calibration

14. Run with Libre 3 for a week
15. Review pre-run slope thresholds — 1-min data may need tighter or looser bounds
16. Evaluate whether observation window line-fitting (least squares) improves model confidence
17. BG model retrains automatically from new 1-min observations

---

## Data Migration

**Historical data stays as-is.** The BG model will naturally phase out old 5-min observations as new 1-min runs accumulate. No backfill needed.

If mixed data causes issues (old per-5-min rates alongside new per-min rates), add a `cgmIntervalMin` field to `BGObservation` at extraction time and normalize on read. But this is likely unnecessary — the model already groups by category and fuel rate, and old data ages out.

---

## What We Gain

- **New BG value every minute during runs.** SugarRun (data field) polls every 60 seconds mid-activity. SugarWave and SuperStable (watchfaces) are locked to 5-min fetches by Garmin SDK but show the latest available reading on each refresh.
- **Pre-run slope in 3-5 min** instead of 15-25 min — earlier readiness signal
- **Direction arrows respond in 1-2 min** instead of 5-10 — actionable mid-run
- **Stale detection in 3 min** instead of 10 — faster sensor-down awareness
- **Post-run spike detection** with real shape — catches 2-min spikes that 5-min sampling misses entirely
- **BG simulation at 1-min resolution** — smoother prediction curves
- **Better model confidence** — 5 data points per observation window instead of ~1

## What We Lose

- **Nothing.** Every surface gets higher resolution. The BG model's internal 5-min analysis window gets denser data. No downsampling anywhere.

## Risks

- **Libre 3 noise profile is different from Dexcom.** 1-min readings may have higher point-to-point variance. Monitor whether pre-run thresholds need recalibration after a week of data.
- **Garmin battery.** SugarRun polls every 60s during activities (bounded by activity duration). SugarWave and SuperStable stay at 5-min polls (SDK minimum). No battery concern.
- **xDrip+ compatibility.** If Libre 3 data flows through xDrip+, verify xDrip+ sends readings at 1-min intervals and doesn't resample to 5-min. If it resamples, the ingestion layer handles it gracefully (normalizes to per-minute regardless of actual interval).
