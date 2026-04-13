# Pace Auto-Update — Current Status

**Branch:** `feat/pace-auto-update` (PR #155)
**Date:** 2026-04-13
**Spec:** `docs/specs/2026-04-13-pace-auto-update.md`

## What's done and working

### Category detection fix
- `categoryFromExternalId()` in `lib/paceInsight.ts` derives category from `external_id` prefix
- Wired into both `processPlannedEvents` and `processActivities` in `lib/calendarPipeline.ts`
- Falls back to name-based detection for events without `external_id`
- Tests pass (10 tests)

### Trend signals
- **Signal 1: Z4 pace trend** — uses existing `computeZonePaceTrend()`. Compares Z4 slope over 90 days. Improvement threshold: 10 sec/km. Regression: 15 sec/km. Compares Z4 data *to itself over time*, so terrain bias cancels out (as long as terrain mix is consistent week to week).
- **Signal 2: Cardiac cost trend** — `computeCardiacCostTrend()` in `lib/paceInsight.ts`. Compares `correctedHr x pace` product between two 4-week windows. Temperature-corrected using Stockholm monthly averages. Improvement: >3% drop. Regression: >5% rise. Tests pass (4 tests).
- **Confidence matrix** — both same direction = high, one signal = medium, conflicting = null. Tested.

### Race result signal
- Detects completed race (`category === "race"`) within 28 days
- Distance match (within 10%): direct comparison, suggests race time as ability (improvement only — a single slow race doesn't suggest regression)
- No distance match: attaches race result to trend suggestion for UI display
- Tests pass (4 tests)

### Supporting infrastructure
- `pace_suggestion_dismissed_at` column added to DB schema and production
- `getUserSettings` / `saveUserSettings` read/write the new field
- `paceSuggestionAtom` in `app/atoms.ts` — derived from `paceCalibrationAtom` + `settingsAtom` + `enrichedEventsAtom`
- Break detection: 14+ day gap within 90-day window, requires 4+ post-break runs before computing
- 2% ability cap for trend-based suggestions
- `Math.round()` on suggested ability seconds (DB column is INTEGER)

### UI
- `PaceSuggestionCard.tsx` — renders improvement, regression, and race result variants. Shows evidence text (sec/km improvement, efficiency %, race result comparison). Loading state with spinner on accept.
- `PaceSuggestionBanner.tsx` — fixed bottom banner on non-Intel tabs. "Pace update available" / "Pace adjustment suggested". View button switches to Intel tab.
- Wired into `IntelScreen.tsx` Overview tab (between Readiness and Volume Compact) and `page.tsx`

### Accept flow
1. Save new `currentAbilitySecs` to DB
2. Push threshold pace to Intervals.icu (checks response status)
3. Regenerate plan with new ability (all PlanConfig params)
4. Upload future events to Intervals.icu (which deletes old future events first)
5. Best-effort Google Calendar sync
6. Reload calendar
7. On failure: reverts ability to previous value, shows error message to user

### Tests
- `lib/__tests__/paceInsight.test.ts` — 34 tests (category, temperature, cardiac cost, suggestion generation, regression, break detection, race result, calibration gap)
- `app/components/__tests__/PaceSuggestionCard.integration.test.tsx` — 6 tests (all variants, callbacks, loading state)
- `app/components/__tests__/SettingsOverlay.integration.test.tsx` — 5 tests (unrelated to pace, but fixed and included: added `ArrowLeft` to lucide mock, removed redundant setup-dom import, fixed loading state assertion)
- Full suite: 79/79 files, 1263/1263 tests pass. Lint clean.

### Review fixes applied
- Unit conversion bugs: race distance meters→km, `currentAbilityDist` already in km (was /1000)
- Error handling: accept handler shows error to user and reverts ability on failure
- Race result only suggests improvement (not regression from single bad race)
- Banner positioned above notification prompt (z-50, bottom-28)
- Removed unnecessary `'use client'` from PaceSuggestionCard

## What's broken: calibration gap signal

### The problem it solves
If a user sets 37:00 5K but actually runs at ~27:00 fitness, the trend signals won't fire because trends are flat — the user has always been faster than the setting. There's no *change* over time, just a static *mismatch*. New users who set ability wrong in the wizard, or users who haven't updated after significant improvement, are not served by trend signals.

### Current implementation (Z4-based, unreliable)
`generatePaceSuggestion()` in `lib/paceInsight.ts` compares observed Z4 pace (duration-weighted average of Z4 segments) to expected Z4 from `getPaceTable()`. Fires when gap > 20 sec/km. Uses 30% cap instead of 2% trend cap.

### Why it doesn't work for trail runners
Tested against Per's real data (40 activities, correct HR zones `[112,147,164,183,189]` for maxHR 189):

- Z4 segments include hill running where HR is 165+ but pace is 7-9 min/km (steep uphill). These inflate the observed Z4 average.
- With correct zones, only 28 Z4 segments exist (most "Z4" from the wrong-zone diagnostic were actually Z3).
- All Z4-based approaches produce 31-35 min 5K estimates — 4-8 minutes too slow — because trail terrain dominates.

### Approaches explored and findings from Per's data

| Approach | Estimate | Error vs 27:00 | Problem |
|---|---|---|---|
| Z4 weighted average | 34:51 | +8 min | Terrain-contaminated |
| Z4 P25 (25th percentile) | 31:18 | +4 min | Still includes hill data |
| Z4 CV-filtered (low-variance sessions) | 33:34 | +6.5 min | Consistent hills still included |
| Z2 easy pace (all, ÷1.12) | 28:47 | +1:47 | Inverting Ben Parkes ratio gives ±10% |
| Z2 long segments (≥10min, ÷1.12) | 28:26 | +1:26 | Better but still ±10% |
| Pace curve 5K PB | 26:39 | -0:21 | Direct measurement, could be stale |

### Open design questions

1. **Which data source for the calibration gap?**
   - **Pace curve PB**: Most accurate (direct measurement, 26:39 vs actual ~27:00). But could be a "unicorn" peak that doesn't represent current sustainable ability. Research says: with continued training, PB validity holds for months (Mujika 2012, Hickson 1985). Detraining losses are <5% with continued training.
   - **Z2 easy pace**: Reasonable estimate (28:26, within 5%). But the 1.12× ratio is a prescription (race→easy), not a diagnostic (easy→race). Inverting it gives ±10% accuracy. Ben Parkes' range is 1.06-1.17×, so a 7:00/km easy pace could mean 27:30 to 30:30 5K.
   - **Blend**: More complex, unclear if better than either alone.
   - **Decision needed before merging.**

2. **What threshold for the gap?**
   - Currently 20 sec/km (Z4-based, to be replaced).
   - For PB-based: 10% of ability time seems reasonable. For Z2-based: needs wider threshold due to lower accuracy.
   - **Depends on which data source is chosen.**

3. **Should the calibration gap exist in this PR at all?**
   - The trend signals + race result work correctly.
   - The calibration gap is the only signal that catches "setting is wrong from day 1."
   - Option: ship trends + race result now, add calibration gap as a follow-up after more research/testing.

## What to do next

### Option A: Remove calibration gap, ship trends + race result
Remove the calibration gap code from `generatePaceSuggestion()` (the "Signal 0" block at lines 255-290 of `lib/paceInsight.ts`). Remove the related constants (`CALIBRATION_GAP_THRESHOLD`, `MIN_Z4_SEGMENTS_FOR_GAP`). Remove the calibration gap tests. Remove the `getPaceTable` import. The trend signals and race result still work. Ship the PR.

Follow up with a separate PR that adds the calibration gap using the chosen approach (PB, Z2, or blend).

### Option B: Replace Z4 calibration gap with PB-based
Change the calibration gap to use `paceCurveDataAtom` best efforts instead of Z4 segments:
1. Add `paceCurveData` to `PaceSuggestionInput`
2. Find best effort at reference distance (within 10% tolerance)
3. Verify training continuity since PB date (no 14+ day gaps)
4. Fire if `|ability - PB| > ability × 0.10`
5. Suggest the PB time directly

This requires wiring `paceCurveDataAtom` into `paceSuggestionAtom`, which is a small change but adds a dependency on pace curve data loading.

### Option C: Replace with Z2-based
Use Z2 easy pace to estimate ability via the 1.12× inverse. Acknowledge ±10% accuracy. Use a wider threshold (15%?) to avoid false positives. This has no new data dependencies but lower accuracy.

### Debug endpoint
`app/api/debug/pace-suggestion/route.ts` exists but needs auth (can only be called from the browser with a session). Consider removing before merge (it's a debug tool, not production code).

## Files changed in PR

### New files
- `lib/paceInsight.ts` (357 LOC) — all pace insight logic
- `app/components/PaceSuggestionCard.tsx` (113 LOC)
- `app/components/PaceSuggestionBanner.tsx` (43 LOC)
- `app/components/__tests__/PaceSuggestionCard.integration.test.tsx` (94 LOC)
- `app/components/__tests__/SettingsOverlay.integration.test.tsx` (112 LOC)
- `lib/__tests__/paceInsight.test.ts` (497 LOC)
- `app/api/debug/pace-suggestion/route.ts` (debug endpoint, remove before merge)
- `docs/specs/2026-04-13-pace-auto-update-plan.md` (implementation plan)

### Modified files
- `lib/types.ts` — `external_id` on `IntervalsEvent`
- `lib/calendarPipeline.ts` — `categoryFromExternalId` wiring
- `lib/db.ts` — `pace_suggestion_dismissed_at` column
- `lib/settings.ts` — read/write `paceSuggestionDismissedAt`
- `lib/__tests__/setup-dom.ts` — `ArrowLeft` in lucide mock
- `app/atoms.ts` — `paceSuggestionAtom`
- `app/screens/IntelScreen.tsx` — card + accept handler
- `app/page.tsx` — banner
- `docs/specs/2026-04-13-pace-auto-update.md` — updated spec

## Key learnings for the next agent

1. **HR zones matter critically.** The Runna model for maxHR 189 gives zones `[112, 147, 164, 183, 189]`, NOT the test constants `[114, 140, 155, 167, 189]`. Z4 is 165-183 bpm. Always use `computeMaxHRZones(maxHr)` from the user's settings, never hardcode.

2. **Z4 pace is unreliable for absolute ability estimation on trail runners.** Terrain inflates pace at the same HR. Z4 works for *trends* (comparing to itself over time) but not for *calibration* (comparing to expected pace from ability settings).

3. **`currentAbilityDist` is in kilometers, not meters.** This caused two bugs that were caught in review. `CalendarEvent.distance` from Intervals.icu is in meters.

4. **The 0.92 Z4-to-threshold ratio is for racing, not training.** Training Z4 pace is ~15-20 sec/km slower than racing Z4 due to conservative pacing. Don't use it to derive ability from training Z4.

5. **Per's data profile:** ~40 cached activities, ~28 real Z4 segments (correct zones), ~109 Z2 segments. Runs on trails (Järfälla area). MaxHR 189. 5K PB 26:39 (2025-12-16). Easy pace ~7:00 min/km.
