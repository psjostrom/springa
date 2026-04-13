# Pace Auto-Update System

**Status:** Approved, ready for implementation plan.

## Problem

Training paces are static — set once in the wizard and never updated unless the user manually adjusts the ability slider. A runner who trains for months gets fitter but keeps running at the same prescribed paces. The system should detect improvement and suggest updating.

## Design

### Prerequisite: fix event category detection

`CalendarEvent.category` is currently inferred by parsing the event name in `calendarPipeline.ts` (`name.toLowerCase().includes("race")`, `getWorkoutCategory(name)`). This is fragile and produces bugs — "RACE TEST" events are miscategorized as `"race"` instead of `"long"`.

**Fix:** Derive category from `external_id` prefix for Springa-generated events. The generators already encode category in `external_id`: `speed-{week}`, `easy-{week}-{day}`, `long-{week}`, `race`, `free-{week}-{day}`, `club-{week}`, `ondemand-{date}`.

In `calendarPipeline.ts`, when processing planned events:

```ts
function categoryFromExternalId(externalId?: string): CalendarEvent["category"] | null {
  if (!externalId) return null;
  const prefix = externalId.split("-")[0];
  if (prefix === "race") return "race";
  if (prefix === "long") return "long";
  if (prefix === "speed" || prefix === "club") return "interval";
  if (prefix === "easy" || prefix === "free") return "easy";
  if (prefix === "ondemand") return "other";
  return null;
}
```

Use this as the primary source. Fall back to `getWorkoutCategory(name)` only when `external_id` is missing (manually created events, external activities).

### Three signal sources

All feed into one suggestion. Different confidence levels, different data requirements, same output.

#### Signal 1: Speed session pace trend

**What:** Z4 pace getting faster over time.

**Data:** Z4 segments from `extractZoneSegments()` (already exists). Trend via `computeZonePaceTrend(segments, "z4")` (already exists).

**Trigger:** Z4 pace trend is negative (improving) by at least 10 sec/km over the 90-day window. Minimum 4 speed sessions with Z4 segments.

**Evidence text:** "Your interval pace has improved by {X} sec/km over the last {Y} weeks."

#### Signal 2: Easy run cardiac cost trend

**What:** Lower HR at easy pace = better aerobic base.

**Data:** Z2 segments from `extractZoneSegments()` (already exists). Each segment has `avgPace` and `avgHr`.

**Method:** New function `computeCardiacCostTrend(segments)`.

For each Z2 segment, compute cardiac cost ratio: `avgHr / avgPace`. Higher ratio = harder effort for a given pace. Track this ratio over time with linear regression. Falling ratio = improving fitness.

The ratio normalizes for pace variation between runs — a runner who runs faster on some easy runs will have higher HR, but the ratio stays constant if fitness is unchanged.

**Trigger:** Cardiac cost ratio drops by >3% comparing the most recent 4-week window to the previous 4-week window. Minimum 4 easy runs with Z2 segments per window.

**Evidence text:** "Your easy runs show improving efficiency — lower heart rate at similar effort over the last {X} weeks."

#### Signal 3: Race result

**What:** Completed activity paired with a race day event.

**Data:** `CalendarEvent` with `category === "race"` and `activityId` set (completed). Activity has `distance` and `moving_time`.

**Trigger:** A completed race exists that hasn't been processed for a suggestion yet. The race time, converted to the user's ability reference distance via Riegel formula, is faster than current `currentAbilitySecs`.

**Evidence text:** "You raced {distance} in {time}. That's equivalent to {refDist} in {eqTime} — faster than your current {refDist} ability of {currentTime}."

### Confidence levels

| Speed (Z4) | Easy (cardiac cost) | Race result | Confidence |
|---|---|---|---|
| — | — | Faster than current | High (ground truth) |
| Improving | Improving | — | High |
| Improving | No data / flat | — | Medium |
| No data / flat | Improving | — | Medium |
| Flat | Flat | — | None |
| Conflicting | Conflicting | — | None |

Race result always overrides trend signals — it's ground truth.

### Computing the suggested ability time

**From race result:** Convert race time at race distance to the user's ability reference distance using the Riegel formula (`getHmEquivalentTimeSecs` already exists, generalized). If the user's reference is 10K and they ran a 5K in 26:00, convert to equivalent 10K time. This is the suggested ability time. No dampening — a race is ground truth.

**From trends:** Estimate the improvement magnitude from Z4 pace trend slope. A 10 sec/km Z4 improvement ≈ proportional ability time improvement (Z4 = `hmEquivalentPace * 0.90-0.94`). Cap at 60 seconds improvement per suggestion to avoid over-correction. The runner can accept and get another suggestion in 4 weeks.

### When to compute

Compute when the Intel tab renders and pace calibration data is available (from `paceCalibrationAtom`, already computed). No new API calls. No background computation.

The suggestion is derived from the same `ZoneSegment[]` data that `paceCalibrationAtom` already produces.

### Suggestion lifecycle

1. **Generated:** conditions met, suggestion computed
2. **Shown:** card in Intel tab, banner on calendar
3. **Accepted:** ability time updated, threshold pushed to Intervals.icu, suggestion cleared
4. **Dismissed:** hidden for 4 weeks (timestamp stored in DB)
5. **Expired:** a new suggestion can appear after 4 weeks regardless of dismissal

Store in `user_settings`:
- `pace_suggestion_dismissed_at INTEGER` — timestamp of last dismissal (null = never)

### UI

#### Intel tab — suggestion card

When a suggestion is available, show at top of Intel tab:

```
┌─────────────────────────────────────────┐
│  ⚡ Your paces may need updating        │
│                                         │
│  Your interval pace has improved by     │
│  12 sec/km over the last 6 weeks, and   │
│  your easy runs show better efficiency. │
│                                         │
│  Suggested: 10K in 53:30 (was 55:00)    │
│                                         │
│  [Update paces]          [Not now]      │
└─────────────────────────────────────────┘
```

For race results:
```
┌─────────────────────────────────────────┐
│  🏁 Race result available               │
│                                         │
│  You ran 16km in 1:58. That's           │
│  equivalent to 10K in 52:40 — faster    │
│  than your current 10K ability of       │
│  55:00.                                 │
│                                         │
│  [Update paces]          [Not now]      │
└─────────────────────────────────────────┘
```

"Update paces" → saves new ability, pushes threshold, shows before/after pace preview.

"Not now" → sets `pace_suggestion_dismissed_at`, hides for 4 weeks.

#### Calendar banner

Small banner like `UnratedRunBanner`: "Pace update available · View" — taps switches to Intel tab. Shown when suggestion exists and not dismissed.

### What happens on accept

1. Save new `currentAbilitySecs` to `user_settings`
2. Push new threshold pace to Intervals.icu via `/api/intervals/threshold-pace`
3. Show brief before/after pace comparison
4. Clear the suggestion state
5. Future workouts use new paces (next plan generation or on-demand workout)

### GAP

Not used. Raw pace trends detect improvement regardless of terrain — the slope is the same whether measured in raw pace or GAP. Activity-level `gap` from Intervals.icu is available if raw trends prove too noisy in practice, but it's not part of the initial implementation.

## Files

### New files
- `lib/paceInsight.ts` — `computeCardiacCostTrend()`, `generatePaceSuggestion()`, confidence scoring, ability time estimation
- `app/components/PaceSuggestionCard.tsx` — suggestion card UI (Intel tab)
- `app/components/PaceSuggestionBanner.tsx` — calendar banner nudge

### Modified files
- `lib/calendarPipeline.ts` — `categoryFromExternalId()`, use as primary category source
- `lib/db.ts` — add `pace_suggestion_dismissed_at` column to schema
- `lib/settings.ts` — read/write the new column
- `app/screens/IntelScreen.tsx` — render PaceSuggestionCard
- `app/page.tsx` — render PaceSuggestionBanner

### Not modified
- `lib/paceCalibration.ts` — already provides all needed data
- `lib/workoutGenerators.ts` — already sets external_id with category prefix

## Testing

- Unit: `computeCardiacCostTrend` — improving segments → negative trend, flat → null, insufficient data → null
- Unit: `generatePaceSuggestion` — dual signal high confidence, single signal medium, no signal → null, dismissed within 4 weeks → null, race result → high confidence
- Unit: `categoryFromExternalId` — all prefix mappings, null fallback
- Integration: PaceSuggestionCard renders with mock suggestion, accept calls onSave, dismiss hides card
- Integration: race result produces suggestion when paired activity is faster

## Out of scope

- Periodic prompt ("it's been 8 weeks")
- Temperature correction for cardiac cost
- GAP normalization
- Per-point GAP computation
- Effort-based mode for beginners
- Auto-regenerate plan on accept (user can do this manually from Planner)
