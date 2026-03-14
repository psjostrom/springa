# Springa - Project Context & Domain Logic

Personal/medical data (runner profile, physiological metrics, T1D management, equipment) lives in `.claude.local.md`.

## Workflow Rules

- **Mobile preview:** Push main to the `dev` branch with `git push origin main:dev`. Vercel deploys it to a fixed preview URL. Google OAuth is pre-configured for this URL. No need to create throwaway branches for testing.
- **Test locally first.** Don't suggest pushing to dev for testing when localhost is available. Dev deploys are for mobile/OAuth testing that can't run locally.
- **Worktrees:** Use Claude Code's built-in `--worktree` flag or `isolation: "worktree"` for subagents. Worktrees live at `.claude/worktrees/<name>/` (excluded in vitest, eslint, and gitignore).
- **Commits:** For multi-line commit messages, write the message to a temp file and use `git commit -F /tmp/commit-msg.txt`, then delete the temp file. Never use `$()` command substitution in bash — it triggers an approval prompt.


## Tech Stack

Next.js 16 (App Router) · TypeScript · Vitest · Turso (libsql) · Jotai · Tailwind · Vercel

**Commands:** `npm run dev` · `npm test` (`vitest run`) · `npm run lint` (`eslint`) · `npm run build`

## Key Files

- `lib/workoutGenerators.ts` — workout generation logic
- `lib/bgModel.ts` — BG response model and fuel rate targets
- `lib/fuelRate.ts` — fuel rate resolution per workout category
- `lib/reportCard.ts` — post-run scoring (BG + HR compliance)
- `lib/adaptPlan.ts` — AI-driven plan adaptation
- `lib/prerun.ts` — pre-run readiness assessment and push notifications
- `lib/constants.ts` — HR zones, pace zones, zone resolution
- `lib/xdrip.ts` — xDrip+ data ingestion and direction recomputation
- `lib/intervalsApi.ts` — Intervals.icu API client (fetch, upload, sync)
- `lib/calendarPipeline.ts` — calendar event processing pipeline

## Data Integrity

- **Treat every repo as if the data matters.** Springa manages diabetes and training for a T1D runner. Wrong data can cause real harm. Never treat architecture as disposable. Sloppy state management, redundant storage, and hot fixes compound.
- **NEVER cache external API data in the local DB when the API is the source of truth.** Store credentials (API keys) and data that's expensive to recompute (stream timeseries). Never store scalar metadata (distance, duration, HR, names, etc.) that can be fetched from the API in a single call.
- **NEVER store a database row that can't be retrieved by its intended lookup path.** If a required key isn't available yet, block the operation.
- **A write operation lives in exactly one place.** If two routes can write the same field, one of them is wrong.
- **API routes do one thing.** A route that analyzes runs does not link feedback or sync carbs. Side effects happen at the point of user action.

## 1. Core Purpose

This is a specialized workout generator for a Type 1 Diabetic runner targeting the **EcoTrail 16km (2026-06-13)**. The application generates training plans that sync directly to **Intervals.icu**, with a heavy focus on blood glucose management and aerobic base building. After it has been uploaded to Intervals, it gets synced with **Garmin Connect** and can therefore be started from the user's **Garmin Forerunner 970**.

Training philosophy is inspired by **Ben Parkes' half marathon plan** — pace-based training with workout variety, progressive long runs, and a strong emphasis on keeping easy runs truly easy.

## 2. Intervals.icu Integration Rules (Strict)

To ensure the generated text is parsed correctly by the workout builder and displayed on the watch:

- **Duration:** ALWAYS use `m` (e.g., `10m`, `45m`). NEVER "min" or "mins".
- **Step Format:** `[Duration] [Min%]-[Max%] LTHR ([MinBPM]-[MaxBPM] bpm)`
- **Fuel Data:** Fuel info is sent via the `carbs_per_hour` API field on events, NOT embedded in descriptions. The `fuelRate` field on `WorkoutEvent` stores g/h; the upload function passes it directly as `carbs_per_hour` (rounded). Default is 60 g/h for all categories; the BG model overrides with per-category targets when data is available.
- **Descriptions:** Clean workout text only — no `FUEL PER 10:` or `PUMP` prefixes. Notes/flavor text goes before the Warmup section. Backward compat: parsers still handle old-format descriptions with fuel text for historical data.
- **Workout Naming:**
  - MUST include the **Suffix** (e.g., "eco16") for analysis filtering.
  - Long runs MUST contain "Long" (e.g., "Sun Long"). DO NOT use "LR".
  - Saturday runs MUST include "Bonus" in the name (e.g., "Bonus Easy", "Bonus Easy + Strides"). The session type can vary, but must leave energy for Sunday's long run.

## 3. Workout Types (Ben Parkes–inspired)

The plan uses rotating workout types to keep training varied and engaging. Every quality session is different.

### Easy Day Variants

#### Easy Run

Pure easy pace. Conversational. The foundation of the plan. Duration follows the Ben Parkes progression: starts at ~5k and builds to ~8k during peak weeks, then drops back for taper/race prep. Recovery weeks also use a shorter duration.

- **Pace:** Easy (7:00–7:30/km)
- **HR:** Z2
- **T1D:** Pump off, moderate fuel
- **Duration formula:** `20 + Math.round(progress * 25)` min main set (+ 10m WU, 5m CD). Recovery/taper/race-test: 20m main. Race week shakeout: 15m main.

#### Easy Run + Strides

Easy run with 4–6x 20-second bursts at 95% effort, 45–60 seconds easy jog between each. Add strides in the second half of the run. Great for form, neuromuscular activation, and breaking up monotony.

- **Base pace:** Easy
- **Strides:** Hard (Z5, <5:00/km) — short enough that BG impact is minimal
- **T1D:** Same as easy run — the strides are too short to trigger significant adrenaline response

### Speed / Quality Session Variants (Thursday)

All speed sessions follow the structure: **10m easy warmup → main set → 5m easy cooldown**. The main set format rotates week to week. **Recovery between reps is always a walk** (Z1), not an easy jog — this follows Ben Parkes' approach and is easier on BG.

#### Short Intervals

High turnover, shorter reps. Good for speed and form.

- **Example:** 6x 2m at interval pace, 2m walk recovery
- **Pace:** Interval (5:05–5:20/km)
- **HR:** Z4
- **Progression:** Increase reps (6x → 8x) or reduce recovery

#### Long Intervals

Sustained harder efforts. Builds lactate tolerance.

- **Example:** 4x 5m at interval pace, 2m walk recovery
- **Pace:** Interval (5:05–5:20/km)
- **HR:** Z4
- **Progression:** Increase rep duration (4m → 5m → 6m) or add reps

#### Distance Intervals

Measured reps for pacing practice.

- **Example:** 8x 800m at interval pace, 200m walk recovery
- **Pace:** Interval (5:05–5:20/km)
- **HR:** Z4
- **Progression:** Increase distance (600m → 800m → 1km) or add reps

#### Hills

Trail-specific strength work. Uphill hard, downhill easy.

- **Example:** 6x 2m uphill at hard effort, 3m easy downhill jog recovery
- **Pace:** Hard effort uphill (Z5) — pace is slow but effort is high
- **HR:** Z5 on the way up, Z2 on the way down
- **Progression:** Increase reps or hill duration
- **Note:** Pace targets don't apply uphill — use effort/HR only

#### Race Pace Intervals

Practice goal race pace in a structured session. Used closer to race day.

- **Example:** 5x 5m at race pace, 2m walk recovery
- **Pace:** Race Pace (5:35–5:45/km)
- **HR:** Z3
- **Progression:** Increase rep duration or reduce recovery

### Club Run (Thursday Alternative)

Trail running club session. When a club run is scheduled, both the speed session and club run appear on Thursday. Start whichever one you choose to do on the watch — the one you complete gets paired correctly via the eco16 suffix.

- **Time:** 18:30 (club meeting time)
- **Duration:** 60 min
- **Pace:** Variable — let the club workout dictate (easy, intervals, hills, etc.)
- **HR:** No fixed target — intensity varies week to week
- **Fuel:** Variable — estimate based on expected intensity (~60g/h if easy, ~30g/h if hard)
- **T1D:** Pump off, fuel based on expected workout type
- **Skipped on:** Recovery weeks, taper, race week (same as speed sessions)
- **excludeFromPlan:** true — not counted in weekly planned volume (mutually exclusive with speed session)

### Long Run Variants (Sunday)

#### Long Run — All Easy

The default. Build distance safely at easy pace. Used in early weeks, recovery weeks, and taper.

- **Pace:** Easy (7:00–7:30/km) for the entire run
- **HR:** Z2
- **T1D:** Pump off, high fuel (60 g/h)

#### Long Run — Race Pace Sandwich

Easy warm-up → race pace block → easy cool-down. The race pace block grows as the plan progresses (2km → 3km → 5km). Used in build weeks to practice race effort within a long run.

- **Structure:** e.g., 3km easy → 3km race pace → 3km easy
- **Easy sections:** Z2
- **Race pace section:** Z3
- **T1D:** Pump off, high fuel — the race pace block may stabilize BG slightly compared to all-easy

### Speed Session Rotation (Example)

To keep things varied, rotate through the formats across the plan:

| Week | Thursday Session                    |
| ---- | ----------------------------------- |
| 1    | Short Intervals (6x 2m)             |
| 2    | Hills (6x 2m)                       |
| 3    | Long Intervals (4x 4m)              |
| 4    | Recovery week — no speed            |
| 5    | Distance Intervals (8x 800m)        |
| 6    | Short Intervals (8x 2m)             |
| 7    | Hills (8x 2m)                       |
| 8    | Recovery week — no speed            |
| 9    | Long Intervals (4x 5m)              |
| 10   | Distance Intervals (6x 1km)         |
| 11   | Race Pace Intervals (5x 5m) — taper |
| 12   | Race week — shakeout only           |

## 4. Full Workout Examples (Reference)

The generator MUST output descriptions matching these patterns exactly. Descriptions contain only notes and structured workout steps — no fuel data. Fuel is sent via `carbs_per_hour` on the API event and stored as `fuelRate` (g/h) on `WorkoutEvent`.

### Example A: Short Intervals

**Name:** `W01 Short Intervals eco16`
**fuelRate:** `30` (g/h → `carbs_per_hour: 30`)
**Description:**

```text
Short, punchy efforts to build leg speed and running economy.

Warmup
- 10m 68-83% LTHR (115-140 bpm)

Main set 6x
- 2m 93-99% LTHR (156-167 bpm)
- Walk 2m 0-68% LTHR (0-114 bpm)

Cooldown
- 5m 68-83% LTHR (115-140 bpm)
```

### Example B: Hills

**Name:** `W02 Hills eco16`
**fuelRate:** `30` (g/h → `carbs_per_hour: 30`)
**Description:**

```text
Hill reps build strength and power that translates directly to EcoTrail's terrain.

Warmup
- 10m 68-83% LTHR (115-140 bpm)

Main set 6x
- Uphill 2m 100-113% LTHR (168-189 bpm)
- Downhill 3m 68-83% LTHR (115-140 bpm)

Cooldown
- 5m 68-83% LTHR (115-140 bpm)
```

### Example C: Long Run — All Easy

**Name:** `W01 Long (8km) eco16`
**fuelRate:** `60` (g/h → `carbs_per_hour: 60`)
**Description:**

```text
Long run at easy pace. This is the most important run of the week.

Warmup
- 1km 68-83% LTHR (115-140 bpm)

Main set
- 6km 68-83% LTHR (115-140 bpm)

Cooldown
- 1km 68-83% LTHR (115-140 bpm)
```

Note: Long runs keep the warmup/cooldown structure even when all-easy for psychological bookends and consistency with sandwich/progressive variants.

### Example D: Long Run — Race Pace Sandwich

**Name:** `W05 Long (12km) eco16`
**fuelRate:** `60` (g/h → `carbs_per_hour: 60`)
**Description:**

```text
Long run with a 3km race pace block sandwiched in the middle.

Warmup
- 1km 68-83% LTHR (115-140 bpm)

Main set
- 4km 68-83% LTHR (115-140 bpm)
- 3km 84-92% LTHR (141-155 bpm)
- 3km 68-83% LTHR (115-140 bpm)

Cooldown
- 1km 68-83% LTHR (115-140 bpm)
```

### Example E: Easy Run

**Name:** `W01 Easy eco16`
**fuelRate:** `48` (g/h → `carbs_per_hour: 48`)
**Description:**

```text
Steady easy running to build your aerobic base. This should feel comfortable and conversational the entire way. If you can't chat in full sentences, slow down. Easy days make hard days possible.

- 35m 68-83% LTHR (115-140 bpm)
```

Note: Easy runs use a single step (no warmup/cooldown structure) since the entire run is in the same HR zone.

### Example F: Easy Run + Strides

**Name:** `W02 Easy + Strides eco16`
**fuelRate:** `48` (g/h → `carbs_per_hour: 48`)
**Description:**

```text
Easy run with strides at the end.

Warmup
- 10m 68-83% LTHR (115-140 bpm)

Main set
- 21m 68-83% LTHR (115-140 bpm)

Strides 4x
- 20s 100-113% LTHR (168-189 bpm)
- 1m 68-83% LTHR (115-140 bpm)

Cooldown
- 5m 68-83% LTHR (115-140 bpm)
```

Note: Easy + Strides keeps the warmup/cooldown structure because strides are in a different HR zone (Z5).

### Example G: Bonus Easy

**Name:** `W03 Bonus Easy eco16`
**fuelRate:** `48` (g/h → `carbs_per_hour: 48`)
**Description:**

```text
The Saturday bonus. Let's be honest — there's maybe a 20% chance this actually happens. If your legs say no, listen to them. If they say yes, enjoy 30 easy minutes with zero expectations. No pace, no plan. Just a gift to future you.

- 45m 68-83% LTHR (115-140 bpm)
```

## 5. Post-Run Report Card

A scoring strip inside `EventModal` (between the stats card and carbs section) that rates each completed run on two axes. Scoring logic lives in `lib/reportCard.ts`, UI in `app/components/RunReportCard.tsx`. Additional context scores (entry trend, recovery) appear in a second row when BG context data is available.

### BG Score (from `streamData.glucose`)

- `startBG`: first reading, `minBG`: lowest reading
- `hypo`: any reading < 3.9 mmol/L
- `dropRate`: (last − first) / (duration in 5-min units) — matches mmol/L per 5m convention (same unit as CGM readings)
- Rating: **good** = no hypo + drop > −0.5 | **ok** = no hypo + drop −0.5 to −1.0 | **bad** = hypo or drop < −1.0

### HR Zone Compliance (from `hrZones`)

- Target zone by category: easy/long → Z2, interval → Z4, race/other → Z2+Z3
- `pctInTarget`: seconds in target / total seconds × 100
- Rating: **good** ≥ 60% | **ok** 40–60% | **bad** < 40%

### UI

- Color-coded dots: green (good), yellow (ok), red (bad)
- Skeleton shimmer while stream data loads
- Returns null if no scores and not loading

## 6. xDrip+ Companion Mode Bug

xDrip+ in **companion mode** (required because CGM is connected to CamAPS FX) returns stale/wrong `direction` and `delta` fields in the Nightscout API. The direction lags behind actual sgv changes by 2-3 readings (~10-15 min). Measured at **31% mismatch rate** across 550 readings.

- **Root cause:** [NightscoutFoundation/xDrip#3787](https://github.com/NightscoutFoundation/xDrip/issues/3787)
- **Fix:** `recomputeDirections()` in `lib/xdrip.ts` recomputes direction from adjacent sgv values on ingestion. The xDrip+ `direction` field is never stored as-is.
- **Garmin side:** SugarRun and SugarWave also compute delta and direction from sgv values on-device.
