# Pace Auto-Update System

**Status:** Spec complete. Ready for review.

## Problem

Training paces are static — set once in the wizard and never updated unless the user manually adjusts the ability slider. A runner who trains for months gets fitter but keeps running at the same prescribed paces. The system should detect improvement and suggest updating.

## Prerequisite: fix event category detection

`CalendarEvent.category` is inferred by parsing the event name in `calendarPipeline.ts`. This is fragile — "RACE TEST" events are miscategorized as `"race"` instead of `"long"` because `name.toLowerCase().includes("race")` matches both.

**Fix:** Derive category from `external_id` prefix. The generators already encode category:

| `external_id` prefix | Category |
|---|---|
| `speed` | `interval` |
| `club` | `interval` |
| `easy` | `easy` |
| `free` | `easy` |
| `long` | `long` |
| `race` | `race` |
| `ondemand` | `other` |

Use `external_id` prefix as primary source. Fall back to `getWorkoutCategory(name)` only when `external_id` is missing (manually created events, external activities).

## Three signal sources

All feed into one suggestion. Different confidence, different data, same output format.

### Signal 1: Speed session pace trend

Z4 pace getting faster over time.

**Data:** Z4 segments from `extractZoneSegments()` (exists). Trend via `computeZonePaceTrend(segments, "z4")` (exists). Returns pace change per day — negative = faster.

**Trigger:** Improvement of at least 10 sec/km over the 90-day window. Minimum 4 speed sessions with Z4 segments.

### Signal 2: Easy run cardiac cost trend

Lower cardiac cost at easy effort = better aerobic base.

**Data:** Z2 segments from `extractZoneSegments()` (exists). Each segment has `avgPace` (min/km) and `avgHr` (bpm).

**Metric:** `avgHr × avgPace` per segment. This product captures both "same pace, lower HR" and "faster pace, same HR" as improvement (product drops in both cases). Higher product = harder effort. Lower product = better fitness.

**Method:** New function `computeCardiacCostTrend(segments)`. Linear regression of the cardiac cost product over time within a 90-day window. Compare most recent 4-week average against previous 4-week average.

**Trigger:** Cardiac cost drops by >3% between the two windows. Minimum 4 easy runs with Z2 segments per window.

### Signal 3: Race result

Completed activity paired with a race day event.

**Detection:** `CalendarEvent` with `category === "race"` and `activityId` set (completed).

**Conversion:** Convert race time at race distance to the user's ability reference distance using the Riegel formula: `T2 = T1 × (D2/D1)^1.06`. Need to export or recreate this — `getHmEquivalentTimeSecs` in `paceTable.ts` is private and HM-specific. Create a general `convertRaceTime(timeSecs, fromDistKm, toDistKm)` function.

**Trigger:** The converted time is faster than current `currentAbilitySecs`. Only suggest when FASTER — this naturally filters out trail races at longer distances where Riegel produces a slower equivalent (expected behavior: a hard trail 16K doesn't imply faster flat 5K ability).

**User has final say.** The suggestion shows the computed value. If Riegel produces something that doesn't make sense (terrain, conditions), the user dismisses. No auto-apply.

## Confidence levels

| Speed (Z4) | Easy (cardiac cost) | Race result | Confidence |
|---|---|---|---|
| — | — | Faster than current | High (ground truth) |
| Improving | Improving | — | High |
| Improving | No data / flat | — | Medium |
| No data / flat | Improving | — | Medium |
| Flat | Flat | — | None |
| Conflicting | — | — | None |

Race result overrides trend signals.

## Suggested ability time

**From race result:** Riegel conversion to reference distance. No dampening — race is ground truth. User can dismiss if it doesn't make sense.

**From trends:** Estimate improvement from Z4 pace trend slope. Z4 ≈ `hmEquivalentPace × 0.90–0.94`, so a 10 sec/km Z4 improvement ≈ ~11 sec/km threshold improvement. Convert to ability time delta at the reference distance. Cap at 60 seconds per suggestion.

## When to compute

Create a `paceSuggestionAtom` derived from `paceCalibrationAtom` + `settingsAtom`. Both IntelScreen and the calendar banner read from this atom. No new API calls — the segment data is already computed by the existing pace calibration pipeline.

## Suggestion lifecycle

1. **Generated:** conditions met, suggestion computed from atom
2. **Shown:** card in Intel tab + banner on calendar
3. **Accepted:** ability time updated, threshold pushed to Intervals.icu, suggestion cleared
4. **Dismissed:** hidden for 4 weeks (`pace_suggestion_dismissed_at` in DB)
5. **Expired:** new suggestion can appear after 4 weeks

## UI

### Intel tab — suggestion card

Trend-based:
```
┌─────────────────────────────────────────┐
│  ⚡ Your paces may need updating        │
│                                         │
│  Your interval pace has improved by     │
│  12 sec/km over the last 6 weeks, and   │
│  your easy runs show better efficiency. │
│                                         │
│  Suggested: 5K in 25:30 (was 27:00)     │
│                                         │
│  [Update paces]          [Not now]      │
└─────────────────────────────────────────┘
```

Race result:
```
┌─────────────────────────────────────────┐
│  🏁 Race result                         │
│                                         │
│  You ran 10K in 53:00 — equivalent to   │
│  5K in 25:15. Your current 5K ability   │
│  is 27:00.                              │
│                                         │
│  [Update to 25:15]      [Not now]       │
└─────────────────────────────────────────┘
```

### Calendar banner

Like `UnratedRunBanner`: "Pace update available · View" — switches to Intel tab.

## What happens on accept

1. Save new `currentAbilitySecs` to `user_settings`
2. Push new threshold pace to Intervals.icu via `/api/intervals/threshold-pace`
3. Show brief before/after pace comparison
4. Clear the suggestion state
5. Future workouts use new paces on next plan generation

## DB changes

Add column to `user_settings`:
```sql
ALTER TABLE user_settings ADD COLUMN pace_suggestion_dismissed_at INTEGER;
```

Update `SCHEMA_DDL`, `getUserSettings` SELECT, `saveUserSettings` write path.

## GAP

Not used for trend analysis. Raw pace trends detect relative improvement regardless of terrain — noise averages out over multiple data points. Activity-level `gap` from Intervals.icu is available for future refinement if raw trends prove too noisy.

## Files

### New
- `lib/paceInsight.ts` — `computeCardiacCostTrend()`, `convertRaceTime()`, `generatePaceSuggestion()`, confidence scoring
- `app/components/PaceSuggestionCard.tsx` — suggestion card UI
- `app/components/PaceSuggestionBanner.tsx` — calendar banner

### Modified
- `lib/calendarPipeline.ts` — `categoryFromExternalId()`, use as primary category source
- `lib/db.ts` — add `pace_suggestion_dismissed_at` to schema
- `lib/settings.ts` — read/write new column
- `app/atoms.ts` — `paceSuggestionAtom` derived from calibration + settings
- `app/screens/IntelScreen.tsx` — render PaceSuggestionCard
- `app/page.tsx` — render PaceSuggestionBanner

### Not modified
- `lib/paceCalibration.ts` — already provides all needed segment data
- `lib/workoutGenerators.ts` — already sets external_id with category prefix

## Testing

- Unit: `computeCardiacCostTrend` — improving → negative slope, flat → null, insufficient data → null
- Unit: `convertRaceTime` — same distance → identity, 5K→10K matches known VDOT tables
- Unit: `generatePaceSuggestion` — dual signal → high confidence, single → medium, none → null, dismissed within 4 weeks → null, race faster → high confidence, race slower → null
- Unit: `categoryFromExternalId` — all prefix mappings, unknown prefix → null, missing → null
- Integration: PaceSuggestionCard renders, accept updates ability, dismiss hides
- Integration: category fix — "RACE TEST" event gets `long` category, "RACE DAY" gets `race`

## Out of scope

- Periodic prompt ("it's been 8 weeks")
- Temperature correction for cardiac cost (SMHI)
- GAP normalization
- Effort-based mode for beginners without pace data
- Auto-regenerate plan on accept
