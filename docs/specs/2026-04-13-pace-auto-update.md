# Pace Auto-Update System

**Status:** Spec partially approved. Race result signal has open questions — see bottom.

## Problem

Training paces are static — set once in the wizard and never updated unless the user manually adjusts the ability slider. A runner who trains for months gets fitter but keeps running at the same prescribed paces. The system should detect improvement and suggest updating.

## Prerequisite: fix event category detection

**APPROVED**

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

## Signal 1: Speed session pace trend

**APPROVED**

Z4 pace getting faster over time.

**Data:** Z4 segments from `extractZoneSegments()` (exists). Trend via `computeZonePaceTrend(segments, "z4")` (exists). Returns pace change per day — negative = faster.

**Trigger:** Improvement of at least 10 sec/km over the 90-day window. Minimum 4 speed sessions with Z4 segments.

## Signal 2: Easy run cardiac cost trend

**APPROVED**

Lower cardiac cost at easy effort = better aerobic base.

**Data:** Z2 segments from `extractZoneSegments()` (exists). Each segment has `avgPace` (min/km) and `avgHr` (bpm).

**Metric:** `avgHr × avgPace` per segment. This product captures both "same pace, lower HR" and "faster pace, same HR" as improvement (product drops in both cases).

**Method:** New function `computeCardiacCostTrend(segments)`. Linear regression of the cardiac cost product over time within a 90-day window. Compare most recent 4-week average against previous 4-week average.

**Trigger:** Cardiac cost drops by >3% between the two windows. Minimum 4 easy runs with Z2 segments per window.

## Signal 3: Race result

**NOT APPROVED — open questions below**

Completed activity paired with a race day event (`category === "race"` after the external_id fix).

## Confidence levels

**APPROVED** (for signals 1+2 only — race result row TBD)

| Speed (Z4) | Easy (cardiac cost) | Confidence |
|---|---|---|
| Improving | Improving | High |
| Improving | No data / flat | Medium |
| No data / flat | Improving | Medium |
| Flat | Flat | None |
| Conflicting | — | None |

## Suggested ability time (from trends)

**APPROVED**

Estimate improvement from Z4 pace trend slope. Z4 ≈ `hmEquivalentPace × 0.90–0.94`, so a 10 sec/km Z4 improvement ≈ ~11 sec/km threshold improvement. Convert to ability time delta at the reference distance. Cap at 60 seconds per suggestion.

## When to compute

**APPROVED**

Create a `paceSuggestionAtom` derived from `paceCalibrationAtom` + `settingsAtom`. Both IntelScreen and the calendar banner read from this atom. No new API calls.

## Suggestion lifecycle

**APPROVED**

1. **Generated:** conditions met, suggestion computed from atom
2. **Shown:** card in Intel tab + banner on calendar
3. **Accepted:** ability time updated, threshold pushed to Intervals.icu, suggestion cleared
4. **Dismissed:** hidden for 4 weeks (`pace_suggestion_dismissed_at` in DB)
5. **Expired:** new suggestion can appear after 4 weeks

## UI

**APPROVED**

### Intel tab — suggestion card (trend-based)

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

### Calendar banner

Like `UnratedRunBanner`: "Pace update available · View" — switches to Intel tab.

## What happens on accept

**APPROVED**

1. Save new `currentAbilitySecs` to `user_settings`
2. Push new threshold pace to Intervals.icu via `/api/intervals/threshold-pace`
3. Show brief before/after pace comparison
4. Clear the suggestion state
5. Future workouts use new paces on next plan generation

## DB changes

**APPROVED**

```sql
ALTER TABLE user_settings ADD COLUMN pace_suggestion_dismissed_at INTEGER;
```

Update `SCHEMA_DDL`, `getUserSettings` SELECT, `saveUserSettings` write path.

## GAP

**APPROVED**

Not used. Raw pace trends detect relative improvement regardless of terrain. Activity-level `gap` from Intervals.icu is available for future refinement if needed.

## Files

### New
- `lib/paceInsight.ts` — `computeCardiacCostTrend()`, `generatePaceSuggestion()`, confidence scoring
- `app/components/PaceSuggestionCard.tsx` — suggestion card UI
- `app/components/PaceSuggestionBanner.tsx` — calendar banner

### Modified
- `lib/calendarPipeline.ts` — `categoryFromExternalId()`, primary category source
- `lib/db.ts` — add `pace_suggestion_dismissed_at` to schema
- `lib/settings.ts` — read/write new column
- `app/atoms.ts` — `paceSuggestionAtom`
- `app/screens/IntelScreen.tsx` — render PaceSuggestionCard
- `app/page.tsx` — render PaceSuggestionBanner

## Testing

- Unit: `computeCardiacCostTrend` — improving → negative slope, flat → null, insufficient data → null
- Unit: `generatePaceSuggestion` — dual signal → high confidence, single → medium, none → null, dismissed within 4 weeks → null
- Unit: `categoryFromExternalId` — all prefix mappings, unknown → null, missing → null
- Integration: PaceSuggestionCard renders, accept updates ability, dismiss hides
- Integration: category fix — "RACE TEST" gets `long`, "RACE DAY" gets `race`

## Out of scope

- Periodic prompt ("it's been 8 weeks")
- Temperature correction for cardiac cost (SMHI)
- GAP normalization
- Effort-based mode for beginners
- Auto-regenerate plan on accept

---

## OPEN: Race result signal

**Not yet decided. Needs design discussion.**

The system can detect when a race is completed (`category === "race"` with `activityId`). The question is what to do with that information.

### What's clear
- We have the race distance and finish time from the activity
- We know the user's current ability (reference distance + time)
- The user should have final say — no auto-apply

### What's NOT decided
1. **Should we auto-compute a suggested ability time from the race result?** This requires converting race time at race distance to the user's reference distance via Riegel. Riegel assumes flat road and doesn't account for terrain/elevation. For a trail runner racing 16K with 400m elevation, the Riegel-converted 5K equivalent will be slower than their actual flat 5K ability — the conversion is meaningless.

2. **Should we just prompt the user to update manually?** "You finished your race. If your fitness has changed, update in Settings." Simpler but less actionable.

3. **Should we only auto-compute when race distance matches reference distance?** Direct comparison (no conversion) — always valid. But most users race at a different distance than their reference.

4. **How does this interact with the trend signals?** By race day, the trend signals may have already captured improvement. Is the race result redundant, complementary, or the primary signal?

5. **What does the race result suggestion card look like?** Different from the trend card — needs to show the race data and the conversion (if any).

These questions should be resolved before implementing the race result signal. The trend-based signals (1 + 2) can ship independently.
