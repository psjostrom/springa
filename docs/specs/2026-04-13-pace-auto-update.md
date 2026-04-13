# Pace Auto-Update System

**Status:** Approved. All sections decided.

## Problem

Training paces are static — set once in the wizard and never updated unless the user manually adjusts the ability slider. A runner who trains for months gets fitter but keeps running at the same prescribed paces. Conversely, a runner returning from a break keeps running at paces that are now too fast. The system should detect both improvement and regression, and suggest updating.

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

New function `categoryFromExternalId(externalId)` returns category or null.

**Planned events:** Use `external_id` prefix as primary source. Fall back to `getWorkoutCategory(name)` only when `external_id` is missing (manually created events).

**Completed activities:** When paired with an event (via `pairedEventId`), inherit category from the paired event's `external_id` prefix. Fall back to `getWorkoutCategory(activity.name)` when unpaired.

**Type change:** Add `external_id?: string` to `IntervalsEvent` interface. Intervals.icu API confirms it returns this field on events.

## Signal 1: Speed session pace trend

Z4 pace getting faster (improvement) or slower (regression) over time.

**Data:** Z4 segments from `extractZoneSegments()` (exists). Trend via `computeZonePaceTrend(segments, "z4")` (exists). Returns pace change per day — negative = faster, positive = slower.

**Improvement trigger:** At least 10 sec/km improvement over the 90-day window. Minimum 4 speed sessions with Z4 segments.

**Regression trigger:** At least 15 sec/km regression over the 90-day window (higher threshold — fatigue is not detraining). Minimum 4 speed sessions with Z4 segments.

## Signal 2: Easy run cardiac cost trend

Lower cardiac cost at easy effort = better aerobic base. Rising cardiac cost = regression.

**Data:** Z2 segments from `extractZoneSegments()` (exists). Each segment has `avgPace` (min/km), `avgHr` (bpm), and `activityDate`.

**Metric:** `correctedHr x avgPace` per segment. The corrected HR accounts for temperature (see below). The product captures both "same pace, lower HR" and "faster pace, same HR" as improvement (product drops in both cases).

**Temperature correction:** Cardiac cost inflates with heat (~1.8 bpm per degree C above 15C). Without correction, comparing April runs to July runs would show fake regression. Correction uses Stockholm monthly average temperatures (deterministic, no API calls):

| Month | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|-------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| Avg C | -1  | -1  | 2   | 7   | 12  | 17  | 20  | 19  | 14  | 8   | 3   | 0   |

`correctedHr = avgHr - max(0, monthTemp - 15) x 1.8`

Examples:
- January run, HR 140: correction 0 bpm (below 15C) -> product uses 140
- July run, HR 140: correction 9 bpm (20-15=5, 5x1.8=9) -> product uses 131
- This ~6.5% correction prevents summer heat from masking real improvement

**Method:** `computeCardiacCostTrend(segments)`. Compare most recent 4-week average of corrected cardiac cost product against previous 4-week average, within a 90-day window.

**Improvement trigger:** Cardiac cost drops by >3% between the two windows. Minimum 4 easy runs with Z2 segments per window.

**Regression trigger:** Cardiac cost rises by >5% between the two windows (higher threshold — same conservatism as Z4). Minimum 4 easy runs with Z2 segments per window.

## Signal 3: Race result

The race result is an **amplifier/trigger** for trend signals, not an independent computation. Riegel conversion is unreliable for trail races (elevation and terrain dominate time), so we don't auto-compute ability time from race results except when distances match.

**Detection:** Completed activity with `category === "race"` (after the external_id fix).

**Behavior by scenario:**

1. **Race distance matches reference distance (within 10% tolerance):** Direct comparison — always valid, no Riegel needed. Show race time vs current ability. "Update to [race time]?" button. This works in both directions (faster or slower).

2. **Race distance doesn't match + trend signals suggest update:** Fold race data into the trend-based suggestion card. Show race result as supporting evidence alongside the trend summary.

3. **Race distance doesn't match + no trend improvement/regression:** Acknowledge the race, show current paces are well-calibrated. Dismiss only.

## Break detection

A gap of 14+ days with no completed runs is a detraining signal. But the first few runs after a break don't represent the new baseline (rapid re-adaptation curve).

**Approach:** After detecting a 14+ day gap, require at least 4 post-break runs with Z2/Z4 segments before computing any trend. No proactive "welcome back" prompt — just let the standard signals detect regression when enough data exists.

## Confidence levels

| Speed (Z4) | Easy (cardiac cost) | Race completed | Direction | Confidence |
|---|---|---|---|---|
| Faster | Improving | Yes | Improvement | High |
| Faster | Improving | No | Improvement | High |
| Faster | Flat / no data | Yes | Improvement | Medium (boosted) |
| Faster | Flat / no data | No | Improvement | Medium |
| Flat / no data | Improving | Yes | Improvement | Medium (boosted) |
| Flat / no data | Improving | No | Improvement | Medium |
| Slower | Getting worse | Yes | Regression | High |
| Slower | Getting worse | No | Regression | High |
| Slower | Flat / no data | Yes | Regression | Medium (boosted) |
| Slower | Flat / no data | No | Regression | Medium |
| Flat / no data | Getting worse | Yes | Regression | Medium (boosted) |
| Flat / no data | Getting worse | No | Regression | Medium |
| Flat | Flat | Yes + distance match | See race signal | High (direct) |
| Flat | Flat | Yes, no match | — | None |
| Flat | Flat | No | — | None |
| Conflicting (one up, one down) | — | — | — | None |

## Suggested ability time

Estimate improvement/regression from Z4 pace trend slope. Z4 ~= `hmEquivalentPace x 0.90-0.94`, so a 10 sec/km Z4 improvement ~= ~11 sec/km threshold improvement. Convert to ability time delta at the reference distance.

**Cap:** 2% of current ability time per suggestion. Examples:
- 5K in 27:00 (1620s) -> max 32s update
- 10K in 55:00 (3300s) -> max 66s update
- HM in 2:00:00 (7200s) -> max 144s update

This is conservative enough to prevent over-correction, scales naturally with distance, and aligns with Runna's "small adjustments" philosophy. The runner can accept and get another suggestion in 4 weeks if they've improved more.

For race results with matching distance: suggested ability time is the race finish time directly (no conversion, no cap).

## When to compute

Create a `paceSuggestionAtom` derived from `paceCalibrationAtom` + `settingsAtom` + `enrichedEventsAtom` (for race detection). Both IntelScreen and the calendar banner read from this atom. No new API calls — segment data already exists from activity streams.

## Suggestion lifecycle

1. **Generated:** conditions met, suggestion computed from atom
2. **Shown:** card in Intel tab + banner on calendar
3. **Accepted:** ability time updated, threshold pushed to Intervals.icu, plan regenerated + uploaded, suggestion cleared
4. **Dismissed:** hidden for 4 weeks (`pace_suggestion_dismissed_at` in DB)
5. **Expired:** new suggestion can appear after 4 weeks

## UI

### Intel tab — improvement card

```
+---------------------------------------------+
|  >> Your paces may need updating             |
|                                              |
|  Your interval pace has improved by          |
|  12 sec/km over the last 6 weeks, and        |
|  your easy runs show better efficiency.      |
|                                              |
|  Suggested: 5K in 25:30 (was 27:00)          |
|                                              |
|  [Update paces]            [Not now]         |
+---------------------------------------------+
```

### Intel tab — regression card

```
+---------------------------------------------+
|  !! Your paces may need adjusting            |
|                                              |
|  Your recent sessions suggest your           |
|  current pace targets are ambitious          |
|  for where your fitness is right now.        |
|  Adjusting can reduce injury risk.           |
|                                              |
|  Suggested: 5K in 27:30 (was 27:00)          |
|                                              |
|  [Adjust paces]            [Not now]         |
+---------------------------------------------+
```

### Intel tab — race result (distance match)

```
+---------------------------------------------+
|  [flag] Race result: EcoTrail 16K            |
|                                              |
|  You finished in 2:18:30 -- 1:30 faster      |
|  than your current 16K ability (2:20:00).    |
|                                              |
|  [Update to 2:18:30]        [Not now]        |
+---------------------------------------------+
```

### Intel tab — race result (no distance match, with trends)

```
+---------------------------------------------+
|  [flag] Race completed: EcoTrail 16K         |
|                                              |
|  Finished in 2:18:30.                        |
|  Your interval pace improved 12 sec/km       |
|  and easy runs show better efficiency        |
|  over the last 8 weeks.                      |
|                                              |
|  [Update paces]              [Not now]       |
+---------------------------------------------+
```

### Calendar banner

Like `UnratedRunBanner`: "Pace update available . View" — switches to Intel tab.

## What happens on accept

1. Save new `currentAbilitySecs` to `user_settings`
2. Push new threshold pace to Intervals.icu via `/api/intervals/threshold-pace`
3. Regenerate future plan events with new paces
4. Upload regenerated plan to Intervals.icu
5. Best-effort Google Calendar sync
6. Reload calendar data
7. Show brief before/after pace comparison
8. Clear the suggestion state

## DB changes

```sql
ALTER TABLE user_settings ADD COLUMN pace_suggestion_dismissed_at INTEGER;
```

Update `SCHEMA_DDL`, `getUserSettings` SELECT, `saveUserSettings` write path.

## GAP

Not used. Raw pace trends detect relative improvement regardless of terrain. Activity-level `gap` from Intervals.icu is available for future refinement if needed.

## Files

### New
- `lib/paceInsight.ts` — `computeCardiacCostTrend()`, `generatePaceSuggestion()`, confidence scoring, temperature correction, race result detection, break detection
- `app/components/PaceSuggestionCard.tsx` — suggestion card UI (improvement, regression, race result variants)
- `app/components/PaceSuggestionBanner.tsx` — calendar banner

### Modified
- `lib/types.ts` — add `external_id` to `IntervalsEvent`
- `lib/calendarPipeline.ts` — `categoryFromExternalId()`, use as primary category source for planned events and completed activities
- `lib/db.ts` — add `pace_suggestion_dismissed_at` to schema
- `lib/settings.ts` — read/write `paceSuggestionDismissedAt`
- `app/atoms.ts` — `paceSuggestionAtom`
- `app/screens/IntelScreen.tsx` — render PaceSuggestionCard in Overview tab
- `app/page.tsx` — render PaceSuggestionBanner

## Testing

- Unit: `categoryFromExternalId` — all prefix mappings, unknown prefix -> null, missing -> null
- Unit: `temperatureCorrectHr` — below 15C -> no correction, above 15C -> correction applied, month boundaries
- Unit: `computeCardiacCostTrend` — improving -> negative change, regressing -> positive change, flat -> null, insufficient data -> null, temperature correction applied
- Unit: `generatePaceSuggestion` — dual signal improvement -> high confidence, single -> medium, regression with higher threshold, conflicting -> null, dismissed within 4 weeks -> null, 2% cap applied, break detection (gap + insufficient post-break data -> null)
- Unit: race result — distance match -> direct comparison, no match + trends -> amplified, no match + no trends -> null
- Integration: PaceSuggestionCard renders improvement variant, regression variant, race result variant
- Integration: accept updates ability + pushes threshold + regenerates plan
- Integration: dismiss saves timestamp and hides card
- Integration: category fix — event with external_id "easy-5-3" gets `easy`, "race" gets `race`, activity paired with "long-3" event gets `long`

## Out of scope

- Periodic prompt ("it's been 8 weeks")
- GAP normalization
- Effort-based mode for beginners
- Historical SMHI API integration (monthly averages are sufficient)
- Location-configurable temperature (hardcoded Stockholm)
