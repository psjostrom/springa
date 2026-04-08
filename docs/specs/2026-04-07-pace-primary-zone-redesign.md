# Pace-Primary Zone Redesign

**Status:** Spec complete, implementation not started.
**Branch:** `feat/karvonen-zone-fallback` (will be repurposed)
**Depends on:** Nothing — can be done independently.

## Problem

Springa prescribes workouts using HR zones (`68-83% LTHR (115-140 bpm)`), but every major running coach and app uses pace as the primary training target. HR zones are useful for post-run analysis and as guardrails, but they're the wrong tool for workout prescription:

1. **HR lag** — takes 15-60s to respond to effort changes. Useless for intervals under 3 min.
2. **Cardiac drift** — HR rises 10-20 bpm over long runs at constant effort. A run that starts in Z2 drifts to Z3 without the runner changing anything.
3. **Day-to-day variability** — caffeine, sleep, stress, heat shift HR by 10-15 bpm independently of effort.
4. **Zone confusion** — Karvonen, %maxHR, and %LTHR produce wildly different zone boundaries from the same inputs. Every 2 months we re-debate which formula is correct.

Meanwhile, the workout reference (`docs/workout-reference.md`) already describes training in pace terms: "Easy 7:00-7:30/km", "Interval 5:05-5:20/km". The generated descriptions just don't match.

## Decision: Pace prescribes, HR supervises

This matches what Daniels (VDOT), Fitzgerald (80/20), Pfitzinger, Ben Parkes, Runna, Garmin Coach, and TrainAsONE all do.

| Run type | Primary target | HR role |
|----------|---------------|---------|
| Easy / Recovery | Pace | Cap — "if above X bpm, slow down" |
| Long run | Pace | Cap — don't exceed Z2 early |
| Tempo / Threshold | Pace | Confirms correct zone after lag |
| Intervals | Pace | Irrelevant (too short) |
| Strides | Pace | Irrelevant |
| Hills | HR / effort | Pace is meaningless uphill |

## Decision: Karvonen for HR zones

HR zones still exist for post-run analysis (BG model, report card, coach AI, zone compliance). The formula:

```
Zone = (maxHR - restingHR) x %intensity + restingHR
```

Percentages: 50/60/70/80/90/100% HRR — standard Karvonen, same as Ben Parkes uses.

| Zone | %HRR | Example (MHR=193, RHR=61) |
|------|------|--------------------------|
| Z1 | 50-60% | 127-140 |
| Z2 | 60-70% | 140-153 |
| Z3 | 70-80% | 153-167 |
| Z4 | 80-90% | 167-180 |
| Z5 | 90-100% | 180-193 |

### Input requirements

- **MHR** — required. From Intervals.icu, or user enters "highest HR you've seen on your watch."
- **RHR** — required. From Intervals.icu wellness data, or user enters it.
- **LTHR** — not needed for zone computation. If available from Intervals.icu, store it but don't use it for zones.

### Fallback cascade

1. Intervals.icu has 5 HR zones configured → use them verbatim (user knows best)
2. MHR + RHR available → compute Karvonen
3. Only MHR → can't compute Karvonen. Prompt for RHR.
4. Nothing → can't compute zones. Block zone-dependent features.

## Workout description format change

### Before (HR-primary)

```
Warmup
- 10m 68-83% LTHR (115-140 bpm)

Main set 6x
- 2m 93-99% LTHR (156-167 bpm)
- Walk 2m 0-68% LTHR (0-114 bpm)

Cooldown
- 5m 68-83% LTHR (115-140 bpm)
```

### After (pace-primary)

```
Warmup
- 10m 70-75% pace

Main set 6x
- 2m 90-95% pace
- Walk 2m

Cooldown
- 5m 70-75% pace
```

Intervals.icu parses `% pace` as percentage of threshold pace. Higher % = faster. This syncs to Garmin as a structured workout with pace targets — the watch shows the pace range and vibrates if you're outside it.

## Pace table: the anchor

### The Ben Parkes model

Ben Parkes derives all training paces from one input: **goal race time.** His pace chart is a lookup table — pick your goal HM time, get Easy/HM Pace/Interval/Strides ranges. No threshold test, no VDOT calculation, no HR data.

Cross-referencing Ben Parkes' table against Daniels VDOT shows they align closely:

| | Ben Parkes (2h20 HM) | Daniels VDOT 31 |
|---|---|---|
| Easy | 7:03-7:46 /km | ~7:10-7:45 /km |
| Race/Threshold | 6:29-6:41 /km | ~6:18 /km |
| Interval (~5K pace) | 6:00-6:13 /km | ~5:36 /km |

Ben Parkes' table is effectively a simplified VDOT table. The ratios to race pace are consistent across goal times:
- Easy: 105-120% of race pace (slower)
- HM Pace: 98-101% of race pace
- Interval: 90-94% of race pace

### Springa's approach: distance + current ability

Two inputs, like Runna:

1. **"What are you training for?"** — distance picker: 5K / 10K / Half Marathon / Marathon
2. **"What could you run it in right now?"** — time picker per distance, with "I don't know" option

Important: ask for **current ability**, not aspiration. If someone says "I want to run HM in 1h45" but they're a 2h30 runner, the training paces will be dangerously fast. Runna's approach: "This is what you can do now. We'll get you faster."

### From any distance to training paces

Ben Parkes' ratios are relative to HM race pace. To support other distances, we convert the user's (distance, time) into an equivalent HM time, then apply the same ratios.

The conversion uses the well-established VDOT relationship between race distances. For a runner of a given fitness level, the time ratios between distances are predictable:

| If you can run... | Your equivalent HM is roughly... |
|------------------|--------------------------------|
| 5K in T | T × 4.65 |
| 10K in T | T × 2.10 |
| HM in T | T (identity) |
| Marathon in T | T × 0.47 |

These are approximate Daniels VDOT conversion factors. They need validation against the published tables but are close enough for pace computation.

**Example:** A runner who can do 10K in 55:00 → equivalent HM ≈ 55 × 2.10 = 115.5 min ≈ 1h56 → round to 1h55 → use Ben Parkes' 2h00 row (closest).

From the equivalent HM time, derive the pace table using Ben Parkes' ratios:

| Intensity | Ratio to HM race pace | Springa zone name |
|-----------|----------------------|-------------------|
| Easy | 110-120% (slower) | easy |
| Race Pace | from user's actual goal distance | steady |
| Interval | 90-94% (faster, ~5K effort) | tempo |
| Strides | 95% effort (no pace target) | hard |

Note: "Race Pace" (steady) uses the actual race pace for the goal distance, not the HM-equivalent. A 10K runner's race pace is faster than their equivalent HM pace. Easy and Interval paces are the same regardless of goal distance — they're derived from the HM-equivalent.

### How it maps to Intervals.icu

Intervals.icu `% pace` is relative to a threshold pace. Springa must set the user's threshold pace in Intervals.icu so that `% pace` targets produce the right absolute paces.

The threshold pace in Daniels' system is roughly the pace you can hold for 60 minutes — for a 2h20 HM runner, that's approximately 6:18/km (faster than race pace because HM takes longer than 60 min).

Springa sets this threshold pace in Intervals.icu via the sport settings API, then uses `% pace` in workout descriptions. In Intervals.icu, higher % = faster:

| Intensity | Springa zone | Intervals.icu syntax | Example (threshold=6:18/km) |
|-----------|-------------|---------------------|----------------------------|
| Walk | — | `Walk 2m` (no target) | — |
| Easy | easy | `10m 80-88% pace` | ~7:09-7:52/km |
| Race Pace | steady | `3km 95-100% pace` | ~6:18-6:37/km |
| Interval | tempo | `2m 105-110% pace` | ~5:43-6:00/km |
| Strides | hard | 95% effort (no pace target) | — |

These percentages need calibration against real Intervals.icu behavior. The examples above assume `80% pace` means "80% of threshold speed" (= threshold pace / 0.80 = slower). This must be verified.

### Hills exception

Hills don't use pace targets — effort/HR is the only meaningful metric uphill:

```
Main set 6x
- Uphill 2m hard effort
- Downhill 3m easy jog
```

## Auto-updating paces

**The problem:** pace doesn't auto-adjust for fitness changes. A runner who trains for 6 months at 7:00/km easy will keep getting 7:00/km prescribed — even though they've improved and could run 6:30/km at the same effort.

### Three update mechanisms

**A. Race results (most accurate)**

When the runner completes a race:
1. Detect from Intervals.icu activity data (race flag, or unusually high effort over a standard distance)
2. Compare actual finish time to current goal time
3. If faster: "You ran [distance] in [time] — that's faster than your current training is based on. Update your paces?"
4. One tap → goal time updates, all future workouts recalculate, new plan events regenerate

Detection criteria for auto-flagging races:
- Distance within 5% of a standard race distance (5K, 10K, HM, Marathon)
- Average HR > 85% of Karvonen Z4 ceiling for the duration
- Not already paired with a planned workout event

**B. HR-pace trend analysis (gradual, no user action needed)**

This is the mechanism that works for runners who never race. Springa already collects HR + pace streams from every run via `paceCalibration.ts`.

**How it works:**

1. For each completed easy run, compute the **cardiac cost**: average HR during steady-state (minutes 5-20, after warmup, before cooldown drift) at the prescribed easy pace.
2. Track cardiac cost as a rolling 4-week average.
3. When the 4-week average drops by **>5 bpm** compared to the previous 4-week window, the runner has improved.
4. Estimate the improvement: a 5 bpm cardiac cost drop at the same pace ≈ ~10-15 sec/km threshold pace improvement (based on the typical HR-pace relationship in trained recreational runners).
5. Suggest the update with evidence: "Over the last 4 weeks, your easy runs at 7:00/km averaged 138 bpm — down from 145 bpm a month ago. Your fitness has improved. Want to update your paces?"
6. Show the proposed new pace table alongside the current one.

**Safeguards against false positives:**
- Require minimum 4 easy runs in each 4-week window
- Exclude runs shorter than 20 minutes (insufficient steady-state data)
- Exclude runs where avg HR < Z1 ceiling (was walking/stopping, not representative)
- Seasonal temperature correction: if avg temperature dropped >10°C between windows, discount the HR drop by ~5 bpm (cold weather lowers HR independently of fitness)
- Never suggest more than one update per 4-week block
- Never auto-apply — always require user confirmation

**What data we already have:**
- HR streams from every run (via Intervals.icu activity streams)
- Pace streams from every run
- HR zone classification (`classifyHR()`)
- Pace-per-zone computation (`paceCalibration.ts`)
- Weather data (via SMHI API, already integrated)

**What we need to add:**
- Cardiac cost computation (avg HR during steady-state at prescribed pace)
- Rolling window comparison
- Temperature-adjusted comparison
- Suggestion UI (notification or modal)

**C. Periodic prompt (safety net)**

Every 8 weeks (aligned with the end of a training phase — prep, build, peak, taper), Springa prompts:

"It's been 8 weeks since your paces were last updated. Options:
- Enter a recent race result
- Run a hard 20 minutes on your next run (we'll extract your threshold)
- Keep current paces"

This catches cases where the HR trend is ambiguous (e.g., summer heat masking fitness gains) and gives the runner agency.

### For the "I don't know" user

If someone selects "I don't know" for goal race time during onboarding:

1. **First 2 weeks: effort-based.** Workouts say "Easy Run 5k" with no pace target. Just run. This matches what Runna does for complete beginners.
2. **After 2 weeks (3+ runs with HR+pace data):** estimate a goal time from observed easy pace. Ben Parkes' table shows easy pace is consistently ~112% of race pace (midpoint of the 105-120% range). So: `race_pace ≈ observed_easy_pace / 1.12`. Example: easy at 7:30/km → race pace ≈ 6:42/km → HM time ≈ 2h21 → round to 2h20 goal.
3. **Show the estimate:** "Based on your recent runs, we estimate you could finish a half marathon in about 2h20. We'll use this to set your training paces. You can change it anytime."
4. **From here, normal flow:** pace table derived from estimated goal, auto-updated via mechanisms A/B/C above.

The key: never block training. Always provide *something* — even if it's just "run easy, we'll figure out your paces." Refine as data comes in.

### Update magnitude: how much to change

When suggesting a pace update, the change should be conservative:
- **From race result:** direct recalculation. If they ran a 10K in 58:00 (VDOT ~32), derive the new pace table directly. No dampening needed — a race result is ground truth.
- **From HR trend:** cap the suggestion at **one goal-time row** (5 minutes) per update. Even if the HR data suggests a 15-minute improvement, suggest only a 5-minute update. Under-estimating improvement is safe; over-estimating leads to injury. The runner can always update again in 4 weeks.
- **From periodic prompt:** depends on what they provide (race result or threshold run).

## Files to change

### Workout description (the core change)
- `lib/descriptionBuilder.ts` — `formatStep()` outputs pace % instead of LTHR %
- `docs/workout-reference.md` — update all examples to pace format

### Pace table
- `lib/paceTable.ts` (new) — derives pace table from goal race time. Lookup table or formula. Returns Easy/Steady/Tempo/Hard pace ranges.
- `lib/constants.ts` — add `computeKarvonenZones()` (exists on branch)

### Workout generation
- `lib/workoutGenerators.ts` — all generators switch from `resolveZoneBand()` to pace ranges from pace table
- `lib/constants.ts` — remove `resolveZoneBand()` dependency from generators (keep for analysis code)

### Auto-update system
- `lib/cardiacCost.ts` (new) — compute steady-state HR at prescribed pace per run, rolling window comparison, temperature adjustment
- Uses existing: `paceCalibration.ts` (zone segments), SMHI weather data, `classifyHR()`

### Wizard / Settings
- `app/setup/GoalStep.tsx` or existing goal step — add goal time picker with "I don't know" option
- `app/setup/HRZonesStep.tsx` — ask for MHR + RHR (already on branch). De-emphasize — HR zones are guardrails, not primary.
- Settings page — display current pace table, allow manual goal time change

### Intervals.icu integration
- `lib/intervalsApi.ts` — set threshold pace in sport settings so `% pace` targets produce correct absolute paces
- `app/api/intervals/hr-zones/route.ts` — still pushes computed Karvonen zones (keeps platforms in sync)

### Analysis (unchanged behavior, different formula)
- `lib/reportCard.ts` — still uses `classifyHR()` with Karvonen zones
- `lib/bgModel.ts` — still uses `classifyHR()` with Karvonen zones
- `lib/coachContext.ts` — zone text updated to show pace as primary, HR as secondary
- `lib/paceCalibration.ts` — unchanged, still computes observed pace per HR zone
- `lib/zoneText.ts` — `buildZoneBlock()` updated

## What stays the same

- BG model — still uses HR streams for glucose-intensity correlation. Post-run analysis, not prescription.
- Fuel rate system — unchanged. Fuel targets are per-category, not per-zone.
- CGM pipeline — unchanged.
- Report card — still scores HR zone compliance as a secondary metric.
- `classifyHR()` — still the ONE function for HR classification.
- Pace calibration from activity data — still runs, feeds into cardiac cost analysis and coach AI.

## Data model

### New field: `goalTime`

Add `goal_time INTEGER` to `user_settings` (seconds). Example: 2h20 = 8400. Nullable — null means "I don't know" / effort-based mode.

Existing fields used: `race_date`, `race_name`, `race_dist` (already in schema). `race_dist` is required — no plan generation without a target distance.

### What happens when goal time changes

When the user updates their goal time (via race result, HR trend suggestion, or manual edit):

1. Derive new pace table from new goal time
2. Update threshold pace in Intervals.icu sport settings (so `% pace` targets recalculate)
3. Update Karvonen HR zones in Intervals.icu (if MHR/RHR changed)
4. **Delete all future planned workout events** from Intervals.icu (the upload function already does this — `uploadToIntervals()` deletes future `WORKOUT` events before uploading)
5. Regenerate the plan with new pace targets
6. Upload new events

This is the same flow as the existing "Generate Plan" action — the only difference is it's triggered by a pace update instead of a manual button press.

## Open questions

1. **Intervals.icu `% pace` semantics.** Must verify before implementation: does `80% pace` mean 80% of threshold *speed* (= slower than threshold) or 80% of threshold *pace value* (= faster)? The workout descriptions depend on getting this right. Test by creating a workout in Intervals.icu with a known threshold pace and checking what absolute pace `80% pace` produces.

2. **Lookup table vs formula.** Should the pace table be a hardcoded lookup (like Ben Parkes' PDF) or computed from Daniels VDOT equations? Lookup is simpler and auditable. Formula handles arbitrary goal times (not just 5-min increments). Lean: start with lookup at 5-min increments, interpolate between rows for odd goal times.

3. **Non-HM distances.** The pace table assumes HM training. If someone trains for 10K or 5K, the easy-to-race-pace ratio changes (e.g., 5K race pace is much faster relative to easy pace). Is this needed now, or is HM-only fine for launch? Lean: HM-only for launch. The wizard already asks for race distance — extend later.

4. **Temperature data availability.** Cardiac cost adjustment needs temperature. We have SMHI (Sweden only). For non-Swedish users, skip the temperature adjustment and require a slightly higher HR drop threshold (e.g., >7 bpm instead of >5 bpm) to compensate for uncontrolled seasonal variation.

## Out of scope

- Planner tab redesign (separate spec)
- BG model changes
- Club run model
- Non-running sports (cycling, swimming)
