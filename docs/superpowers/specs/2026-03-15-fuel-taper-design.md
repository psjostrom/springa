# Fuel Taper and Post-Run BG Feedback Loop

## Problem

Post-run BG spikes are the dominant recovery problem. Analysis of 26 completed runs shows:

- 24 of 26 runs show BG rising in the first 30 minutes post-run (avg +2.2 mmol/L at 30m)
- 6 of 26 peak above 14 mmol/L (all 5 runs since March 1st)
- The spike-then-crash cycle creates dangerous swings (Feb 10: 16.8 peak → 4.7 lowest = 12.1 swing)
- Only 1 post-run hypo in 26 runs — the crash follows the spike, not the run itself

Two root causes:

1. **Carb absorption timing.** The runner fuels every km split. Carbs from the last 2 km (~14 min) are still absorbing post-run with no insulin to match (pump just reconnected, Fiasp onset ~15 min).
2. **Model blind spot.** The BG model optimizes for flat BG *during* the run. It currently targets 63 g/h for easy runs — which works during the run but causes excess carb absorption post-run. As fitness improves, the runner burns less glucose at the same effort, but the model doesn't adjust because it only sees in-run data.

## Solution

Two complementary changes, implemented together:

### Part 1: Cooldown-Based Fuel Cutoff

Extend cooldown steps to serve as a fuel taper boundary. The Garmin watch vibrates and announces "Cooldown" on step transitions — this is the runner's zero-thought "stop fueling" alarm.

**Runner's rule:** "Cooldown beep = take your last fuel. No more after that."

The runner takes one final fuel at the cooldown transition, then nothing. This gives ~14 min absorption buffer (2 km at 7:00/km). The auto-lap resets at step change, so the next km beep inside cooldown is the natural "you should have stopped" reminder — but by then, the runner already stopped at the transition.

| Workout type | Current structure | New structure | Buffer |
|---|---|---|---|
| Easy run (plain) | Single step, no WU/CD | WU 10m + main Xm + CD 15m | ~2 km at 7:00/km |
| Easy + Strides | WU 10m + main + strides + CD 5m | WU 10m + main + strides + CD 15m | ~2 km |
| Long run | WU 1km + main + CD 1km | WU 1km + main + CD 2km | 2 km |
| Bonus | Single step, no WU/CD | WU 10m + main + CD 15m | ~2 km |
| Intervals | WU 10m + reps + CD 5m | No change | N/A |
| Club run | Unstructured | No change | N/A |
| Race day | Special | No change | N/A |

**Intervals excluded.** Post-interval spikes are primarily hormonal (cortisol/adrenaline → liver glycogen dump), not carb absorption. Adding a 15m cooldown changes the workout character. The interval spike is addressed by Part 2 (model feedback).

**Total workout time stays the same.** The main set shrinks by whatever is added to cooldown. Note: the current easy run code computes `totalDuration = duration + 15` where `duration` is the main set variable (20-45m depending on progression). So a W01 easy run has `duration=20`, `totalDuration=35`. The new structure preserves `totalDuration`: WU 10m + main (`totalDuration - 25`)m + CD 15m. For that W01 example: WU 10m + main 10m + CD 15m = 35m.

**Minimum main set duration: 10 minutes.** If adding a 15m cooldown would reduce the main set below 10m, reduce the cooldown to keep main set at 10m.

### Part 2: Post-Run BG Feedback in the Model

Extend `calculateTargetFuelRates()` to penalize fuel rates that cause post-run spikes.

**Current model objective:** Find the fuel rate where in-run BG drop rate = ACCEPTABLE_DROP (-0.1 mmol/L per 5min).

**New model objective:** Find the fuel rate where in-run BG drop rate = ACCEPTABLE_DROP AND post-run BG rise stays below a threshold.

#### New data: Post-Run Spike Metric

For each completed activity with xDrip data, compute `postRunPeak30m`: the maximum BG reading in the 30 minutes after run end minus BG at run end. This captures the spike magnitude without needing to model the 60-120 min crash (which is driven by correction bolus, not fuel rate).

```
postRunPeak30m = max(readings[endMs..endMs+30min]) - endBG
```

This metric joins `BGObservation` alongside `bgRate` and `fuelRate`.

#### Penalty Function

The target fuel rate calculation adds a post-run penalty:

1. Group observations by fuel rate (existing logic in `calculateTargetFuelRates`).
2. For each fuel rate group, compute the average `postRunPeak30m`.
3. Define `ACCEPTABLE_SPIKE = 2.0` mmol/L (a +2 rise in 30 min is manageable; above that, CamAPS struggles to correct without overshooting).
4. For groups where avg `postRunPeak30m > ACCEPTABLE_SPIKE`, apply a downward pressure on the target fuel rate: reduce by `SPIKE_PENALTY_FACTOR` g/h per 1.0 mmol/L excess spike.

The penalty effectively says: "yes, this fuel rate keeps BG flat during the run, but it causes a +5 spike afterwards — lower the rate."

#### Tuning Constants

- `ACCEPTABLE_SPIKE = 2.0` mmol/L (post-run 30m peak above end BG)
- `SPIKE_PENALTY_FACTOR = 4` g/h per 1.0 mmol/L excess spike (conservative — the model adjusts gradually)
- `MIN_POST_RUN_OBS = 5` — need at least 5 activities with post-run xDrip data before applying the penalty
- `MIN_FUEL_RATE = 20` g/h — safety floor. Spike adjustment never pushes the target below this.

These are starting values. After 10+ taper runs, verify against actual post-run data and adjust.

## Data Flow

```
                     Existing flow (during-run)
                     ┌─────────────────────────┐
Activity streams  →  │ extractObservations()    │ → BGObservation[] ─┐
  + xDrip glucose    │   bgRate, fuelRate       │                    │
                     └─────────────────────────┘                    ▼
                                                         calculateTargetFuelRates(obs, spikes?)
                     New flow (post-run)                             │
                     ┌─────────────────────────┐                    │
CachedActivity[]  →  │ extractPostRunSpikes()   │ → PostRunSpikeData[] ─┘
  (RunBGContext.post) │   spike30m, fuelRate     │
                     └─────────────────────────┘
                                                                    ▼
                                                           TargetFuelResult
                                                           (with spikeAdjustment)
                                                                    │
                                                                    ▼
                     getCurrentFuelRate() → workoutGenerators → workout with extended cooldown
```

## Changes

### lib/runBGContext.ts (extended)

Add `peak30m` to `PostRunContext`:

```typescript
export interface PostRunContext {
  // ... existing fields ...
  peak30m: number;      // max BG in 30m after end
  spike30m: number;     // peak30m - endBG (positive = BG rose post-run)
}
```

`computePostRunContext()` already queries the post-run xDrip readings and computes `endBG`. Adding `peak30m` is a one-liner: `Math.max(...recovery30m.map(r => r.mmol))` from the existing `recovery30m` variable. No new xDrip queries needed.

### lib/postRunSpike.ts (new)

Extracts spike data from cached activities for the BG model. Uses `PostRunContext` from `runBGContext.ts`.

```typescript
export interface PostRunSpikeData {
  activityId: string;
  category: WorkoutCategory;
  fuelRate: number | null;
  spike30m: number;     // peak30m - endBG
}

/** Extract spike data from cached activities that have RunBGContext. */
export function extractPostRunSpikes(
  activities: CachedActivity[],
): PostRunSpikeData[]
```

Note: `extractPostRunSpikes` is a pure function over cached data — no DB queries. The spike data is already in `RunBGContext.post.spike30m` once the `PostRunContext` extension is deployed. For activities cached before the extension, `spike30m` will be undefined and those activities are skipped.

### lib/bgModel.ts

**Type change:**

```typescript
export interface TargetFuelResult {
  // ... existing fields ...
  spikeAdjustment: number | null; // g/h reduction from spike penalty, null if no adjustment
}
```

**Function changes:**

- `calculateTargetFuelRates(observations, spikeData?)` accepts optional `PostRunSpikeData[]` parameter.
- When spike data is available with `>= MIN_POST_RUN_OBS` activities for a category:
  - Compute avg spike per fuel rate group.
  - If avg spike > `ACCEPTABLE_SPIKE`, reduce target by `(avgSpike - ACCEPTABLE_SPIKE) * SPIKE_PENALTY_FACTOR`.
  - Clamp result to `>= MIN_FUEL_RATE` (20 g/h safety floor).
  - Set `spikeAdjustment` to the reduction amount.
- Without spike data: `spikeAdjustment = null` (backward compatible).

- `aggregateModel()` (internal, calls `calculateTargetFuelRates`): pass spike data through.
- `buildBGModelFromCached(activities)`: call `extractPostRunSpikes(activities)` and pass result to `aggregateModel`.

### lib/workoutGenerators.ts

**Easy run (plain):** Change from `createSimpleWorkoutText(step, notes)` to `createWorkoutText(wu, [mainStep], cd, 1, notes)`. The existing `totalDuration` (= `duration + 15`) is preserved. Main = `totalDuration - 25`. Minimum main = 10m.

**Easy + Strides:** Change CD duration from `5m` to `15m`. The existing total duration (WU 10m + main + strides ~5m + CD) is preserved. Main set `duration` variable decreases by 10m.

**Long run:** Change CD from `1km` to `2km`. Total distance unchanged. `mainKm = Math.max(km - 3, 1)` instead of `km - 2`.

**Bonus:** Change from `createSimpleWorkoutText` to `createWorkoutText` with WU 10m + CD 15m. Main = 20m (45m total - 25m structure). Update the flavor text to reference the shorter main set duration rather than "30 easy minutes."

No changes to intervals, club runs, or race day.

### lib/descriptionBuilder.ts

No changes. The existing `createWorkoutText()` handles the extended cooldown naturally.

### lib/types.ts

No changes to `WorkoutEvent`. The taper is structural (longer cooldown), not a new field.

## What This Does NOT Change

- `carbs_per_hour` on Intervals.icu events: unchanged. It's the rate while fueling, not total carbs.
- Workout step HR zones: cooldown uses the same easy zone as the main set for easy/long runs.
- Interval workout structure: completely untouched.
- The runner's fueling behavior during the main set: unchanged. Same rate, same km-split rhythm. Just stops when cooldown starts.

## Testing

### Part 1 tests (workoutGenerators)

- Easy run: total duration unchanged, description has WU/main/CD structure, CD = 15m.
- Easy run short (< 35m total): CD reduced to keep main >= 10m.
- Easy + Strides: CD = 15m, total duration unchanged.
- Long run: CD = 2km, total distance unchanged, mainKm = km - 3.
- Bonus: has WU/main/CD structure, CD = 15m.
- Intervals: structure unchanged (still 5m CD).

### Part 2 tests (bgModel + postRunSpike)

- `computePostRunSpike()`: returns correct spike from mock xDrip readings.
- `computePostRunSpike()`: returns null with < 2 post-run readings.
- `calculateTargetFuelRates()` without spike data: behavior unchanged (backward compatible).
- `calculateTargetFuelRates()` with spike data below threshold: no adjustment.
- `calculateTargetFuelRates()` with spike data above threshold: target reduced by penalty.
- `calculateTargetFuelRates()` with < MIN_POST_RUN_OBS: no adjustment.
- Spike adjustment capped: target never goes below 20 g/h (safety floor).

## Validation Plan

After implementing and generating a new plan:

1. Verify workout descriptions show WU/main/CD structure for easy and long runs.
2. Verify total durations and distances are unchanged.
3. Run the recovery analysis script (`scripts/analyze-recovery.ts`) after 5+ taper runs to compare pre-taper vs post-taper spike magnitudes.
4. Monitor `TargetFuelResult.spikeAdjustment` in the BG model output — it should trend toward reducing fuel rates as spike data accumulates.

## Iteration Guide

This feature is designed for iterative tuning. Future agents working on this should understand the following.

### How to evaluate whether it's working

Run `npx tsx scripts/analyze-recovery.ts` to see post-run recovery data. Key metrics:
- **30m change column:** average should decrease (less spike). Pre-taper baseline: +2.2 mmol/L.
- **Peak column:** fewer runs above 14. Pre-taper baseline: 6/26 runs.
- **Swing column:** peak minus lowest — the full spike-then-crash magnitude. Lower is better.
- **Crash column:** spike peaked above 12 AND crashed below 5.5. This is the dangerous pattern — the correction overshoot. Should trend toward zero.
- **Skyrocket column:** should trend toward zero.
- The recovery curves at the bottom show the full 2h post-run BG shape per run.

### Tuning knobs (in order of impact)

1. **Cooldown duration (Part 1):** Currently 2 km / 15m. If 14 min buffer isn't enough (spikes persist), the runner stops fueling one km split before cooldown instead of at cooldown. Change the runner's rule, no code change needed. If it's too aggressive (BG drops during cooldown), shorten cooldown back toward 1 km / 10m.

2. **ACCEPTABLE_SPIKE (Part 2):** Currently 2.0 mmol/L. Lower = more aggressive fuel reduction. If the runner is still spiking post-run after the model stabilizes, lower to 1.5. If BG starts dropping during runs (model cut fuel too much), raise to 2.5.

3. **SPIKE_PENALTY_FACTOR (Part 2):** Currently 4 g/h per 1.0 mmol/L excess. Higher = faster adjustment. If the model is too slow to react, increase to 6. If fuel rates oscillate (drop too fast, then the runner crashes, then they rise again), decrease to 3.

4. **MIN_POST_RUN_OBS (Part 2):** Currently 5. Lower = model reacts with less data (riskier). Higher = more conservative. Don't go below 3.

5. **MIN_FUEL_RATE (Part 2):** Currently 20 g/h. This is a safety floor — going below this risks in-run hypo. Only change if the runner explicitly reports being comfortable at lower rates.

### What "not working" looks like

- **Spikes unchanged:** The cooldown taper isn't helping. Check: is the runner actually stopping fuel at cooldown? Is the spike from carb absorption or hormonal (check intervals vs easy — if intervals spike the same, it's hormonal and the taper can't fix it)?
- **BG drops during cooldown:** The taper removed too much fuel from the end. Fix: shorten cooldown or have the runner take a smaller portion at CD transition instead of a full km-split fuel.
- **Model oscillates:** Fuel rate bounces up and down across plan regenerations. Fix: reduce SPIKE_PENALTY_FACTOR or increase MIN_POST_RUN_OBS for more stable convergence.
- **Model never adjusts:** Not enough post-run xDrip data accumulating. Check that `PostRunContext.spike30m` is being computed and cached (verify `runBGContext` is stored with the new fields in `activity_streams`).

### Intervals (future work)

Intervals are excluded from the cooldown taper because adding 15m of easy running changes the workout. The interval spike is different in character (hormonal vs carb absorption). If interval spikes remain a problem after Part 2 stabilizes:

- Option A: Reduce interval fuel rate directly (the model feedback may do this automatically).
- Option B: Post-run recovery monitor (separate feature, see IDEAS.md) with phase-aware guidance.
- Option C: A Garmin CIQ data field that shows a "fuel zone" indicator. Requires watch-side development.

### Data analysis tools

- `scripts/analyze-recovery.ts` — full post-run recovery analysis across all runs. Shows per-run table, category breakdown, end-BG bands, fuel rate correlation, and raw recovery curves.
- `scripts/check-fuel-targets.ts` — shows current BG model target fuel rates and the fuel rate timeline across activities.
- Both scripts load `.env.local` and query the production Turso DB directly. Run with `npx tsx scripts/<name>.ts`.
