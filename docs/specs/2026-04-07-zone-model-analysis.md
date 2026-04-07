# Zone Model Redesign

**Status:** Research complete, implementation not started.
**Depends on:** Can be done independently of Planner redesign.

## Problem

Springa's HR zone model has multiple inconsistencies:

1. New Intervals.icu accounts default to 7 HR zones. Springa requires exactly 5.
2. The Karvonen fallback (PR #135) is a "get unblocked" workaround — the zone percentages (60/70/80/90/100% HRR) were not validated against the training model Springa is built on.
3. Springa's zone names (easy/steady/tempo/hard) don't align with Ben Parkes' pace model (Easy/HM Pace/Interval/Strides).
4. Different zone computation methods produce wildly different results (~13 bpm difference on Z2 between %maxHR and Karvonen).
5. No clear spec for which formula to use when different inputs are available.

## Ben Parkes' Model (Source of Inspiration)

Ben Parkes' half marathon plans are **pace-based, not HR-based**. His training plan (at `~/Downloads/Half Marathon L1.pdf`) uses 4 effort levels:

| Level | Feel | Purpose |
|-------|------|---------|
| **Easy Pace** | Conversational, relaxed | Aerobic base, most runs |
| **HM Pace** | Goal race pace | Race simulation, long run sections |
| **Interval Pace** | ~5k effort, hard but sustainable | Speed sessions |
| **Strides** | 20s bursts at 95% effort | Form, stride length |

Pace tables are given by goal finish time (e.g., 2h20 HM goal → Easy 7:03-7:46 min/km, HM 6:29-6:41, Interval 6:00-6:13).

His YouTube video references CalculatorSoup for HR zone education, which uses **simple %MHR** (not Karvonen):
- Z1 (Warm Up): 50-60% MHR
- Z2 (Fat Burn): 60-70% MHR
- Z3 (Aerobic): 70-80% MHR
- Z4 (Anaerobic): 80-90% MHR
- Z5 (VO2 Max): 90-100% MHR

## Springa's Current Model

5 HR zones from Intervals.icu: `[Z1top, Z2top, Z3top, Z4top, Z5top]` (BPM boundaries).

These map to 4 training intensities via `ZONE_TO_NAME` in `lib/constants.ts`:
- **Easy** (Z1+Z2): warmups, easy runs, cooldowns
- **Steady** (Z3): race pace sections in long runs
- **Tempo** (Z4): threshold work, interval efforts
- **Hard** (Z5): hill reps, strides

Zone boundaries are used by:
- `resolveZoneBand()` — converts zone name to LTHR percentage range for workout descriptions
- `classifyHR()` — classifies actual HR into zone for compliance scoring
- `formatStep()` — generates "10m 68-83% LTHR (114-140 bpm)" step descriptions
- Workout generators — select zone per step type

## Per's Actual Values

- **MHR:** 193 (Garmin-measured — NOT the 189 in Intervals.icu, needs correction)
- **LTHR:** 170 (from testing)
- **RHR:** 61 (Garmin-measured)
- **Current Intervals.icu zones:** [114, 140, 155, 167, 189]
- **Current pace zones:** Easy 7:03/km @131bpm, Steady 7:04 @146, Tempo 6:42 @160, Hard 6:35

## Zone Computation Comparison

Using Per's values (MHR=193, LTHR=170, RHR=61):

| Method | Z1 top | Z2 top | Z3 top | Z4 top | Z5 top |
|--------|--------|--------|--------|--------|--------|
| Current (Intervals.icu) | 114 | 140 | 155 | 167 | 189 |
| %maxHR (60/70/80/90/100) | 116 | 135 | 154 | 174 | 193 |
| Karvonen (60/70/80/90/100) | 140 | 153 | 167 | 180 | 193 |
| %LTHR (68/83/93/99/maxHR) | 116 | 141 | 158 | 168 | 193 |

**Key observation:** Karvonen Z2 top (153) is 13 bpm higher than the current value (140). An "easy run at up to 153 bpm" is fundamentally different training than "easy at up to 140 bpm". The %LTHR method (last row) produces the closest match to Per's current zones.

## Open Questions

1. **HR zones vs pace zones vs both?** Ben Parkes uses pace. Springa uses HR. Most watches display both. Should workouts specify HR targets, pace targets, or both?

2. **Which formula for zone computation?**
   - When we have LTHR: %LTHR produces the most accurate zones
   - When we have MHR + RHR but no LTHR: Karvonen is standard but produces high Z2
   - When we have MHR only: %maxHR is all we can do but Z2 is too low for trained runners
   - Should we estimate LTHR from MHR + RHR? (LTHR ≈ 85% HRR + RHR is a common estimate)

3. **Zone name alignment:** Should Springa's Easy/Steady/Tempo/Hard map to Ben Parkes' Easy/HM Pace/Interval/Strides?

4. **Should the wizard ask for LTHR?** It's the most valuable input but most beginners don't know it. We already have it from Intervals.icu for users who've set it up. The HRZonesStep currently asks for LTHR as optional — is that enough?

5. **What should happen when zones change?** If a user updates their LTHR in Intervals.icu, their existing plan descriptions reference old zone percentages. Should plans auto-update, or regenerate?

## Files to Change

### Zone computation
- `lib/constants.ts` — `computeKarvonenZones()` (currently used as fallback), may need `computeLTHRZones()` or a unified `computeZones()` function
- `lib/constants.ts` — `resolveZoneBand()`, `classifyHR()`, `HR_ZONE_INDEX`, `ZONE_TO_NAME`

### Workout generation
- `lib/workoutGenerators.ts` — all generators use `makeStep()` which calls `resolveZoneBand()`
- `lib/descriptionBuilder.ts` — `formatStep()` outputs HR zone text

### Zone ingestion
- `lib/intervalsApi.ts` — `fetchAthleteProfile()` currently rejects non-5-zone arrays
- `app/setup/HRZonesStep.tsx` — wizard step, currently uses Karvonen fallback
- `app/api/intervals/hr-zones/route.ts` — pushes computed zones to Intervals.icu

### Zone consumers
- `lib/reportCard.ts` — HR zone compliance scoring
- `lib/bgModel.ts` — BG observations use zone classification
- `lib/coachContext.ts` — zone text for AI coach
- `lib/zoneText.ts` — zone display text
- `lib/paceCalibration.ts` — maps HR zones to pace zones

## Out of Scope

- Planner tab redesign (separate spec)
- Workout content/description changes beyond zone references
- BG model changes
