# GoalStep Wizard Redesign

**Status:** Spec complete, implementation not started.
**Branch:** `feat/karvonen-zone-fallback` (continues pace-primary work)
**Depends on:** Pace-primary core engine (done — pace table, formatPaceStep, workout generators already switched).

## Problem

The wizard's GoalStep allows "Just running" with no distance — but pace-based training requires a distance to derive training paces. Without `goalTime`, the pace table is null and workouts fall back to generic output. Every user needs a distance and an estimated ability to get a useful plan.

## Design

### One wizard step, progressive disclosure

Step 5 of 8. Four sections appear sequentially as the user makes choices:

**1. Distance picker**
- 4 standard buttons in a row: 5K / 10K / Half / Marathon
- "Other distance" below — reveals a km number input (e.g., 16)
- Required. No "just running" option.

**2. Experience level** (appears after distance)
- Three options: Beginner / Intermediate / Experienced
- Each has a one-line description:
  - Beginner: "I'm new to running or getting back into it"
  - Intermediate: "I run regularly and have done a race or two"
  - Experienced: "I've been running for years with specific goals"
- Selection pre-fills the time estimate in section 3

**3. Time slider** (appears after experience)
- Large time display (e.g., "2:20")
- Horizontal slider, range ±30 min around the experience default
- Slider min/max per distance:

| Distance | Slider min | Slider max | Step |
|----------|-----------|-----------|------|
| 5K | 15:00 | 45:00 | 1 min |
| 10K | 35:00 | 1:30 | 1 min |
| Half | 1:20 | 3:15 | 5 min |
| Marathon | 2:45 | 6:30 | 5 min |
| Custom | interpolated | interpolated | varies |

- Live pace preview box updates as slider moves:
  ```
  Your training paces:
  Easy       7:03 – 7:46 /km
  Race       6:29 – 6:41 /km
  Intervals  6:00 – 6:13 /km
  ```

**4. Target date**
- "Race-ready by" label with date picker
- Defaults to 16 weeks from today
- Shows computed week count: "16 weeks"

### Experience-to-time defaults

Research-backed defaults (50th percentile for Intermediate, ~30th for Beginner, ~top 20% for Experienced):

| | 5K | 10K | Half | Marathon |
|---|---|---|---|---|
| Beginner | 35:00 | 1:12:00 | 2:30:00 | 5:15:00 |
| Intermediate | 27:00 | 56:00 | 2:05:00 | 4:15:00 |
| Experienced | 22:00 | 46:00 | 1:45:00 | 3:30:00 |

Custom distances interpolate linearly between nearest standard distances:
```
custom_default = shorter_time + (longer_time - shorter_time) × (custom_km - shorter_km) / (longer_km - shorter_km)
```

Example: 16km Intermediate = `56 + (125 - 56) × (16 - 10) / (21.1 - 10)` = 93 min = 1:33:00

### What's removed from the wizard
- "Just running" / "Yes I have a race" toggle — distance is now required
- Race name field — only in PlannerConfigPanel (cosmetic label)
- Free-text distance input (replaced by standard distance buttons + "Other")

## Data flow

### Wizard output
GoalStep calls `onNext` with:
```typescript
{ raceDist: number; goalTime: number; raceDate: string }
```
- `raceDist`: km (e.g., 21.0975 for Half, 16 for custom)
- `goalTime`: seconds (e.g., 8400 for 2h20)
- `raceDate`: ISO date string

### Settings storage
Saved to `user_settings` via PUT `/api/settings`:
- `race_dist` REAL — already exists
- `goal_time` INTEGER — already added (pace-primary core engine)
- `race_date` TEXT — already exists

### Plan generation
`handleComplete` in `app/setup/page.tsx` passes `goalTimeSecs` to `generatePlan()`:
```typescript
const events = generatePlan(
  null, raceDate, data.raceDist, totalWeeks, 8,
  data.lthr ?? DEFAULT_LTHR, hrZones,
  false, data.diabetesMode,
  { runDays: data.runDays, longRunDay: data.longRunDay, clubDay: data.clubDay, clubType: data.clubType },
  data.goalTime,  // ← new
);
```

### PlannerConfigPanel integration
Add goal time display/edit to the existing race goal section in PlannerConfigPanel:
- Show current goal time as editable (same slider UX as wizard)
- When changed → schedule-change banner appears (existing pattern from PR #136)
- "Regenerate" recalculates plan with new pace table

## Files to change

### Wizard
- `app/setup/GoalStep.tsx` — complete rewrite: distance picker, experience selector, time slider, date picker, pace preview
- `app/setup/page.tsx` — update WizardData to include `goalTime`, pass to `handleComplete`, pass to `generatePlan`

### Planner config
- `app/components/PlannerConfigPanel.tsx` — add goal time field with slider, trigger schedule-change on edit

### Supporting
- `lib/paceTable.ts` — add `getDefaultGoalTime(distanceKm, level)` and `getSliderRange(distanceKm)` functions
- `lib/__tests__/paceTable.test.ts` — tests for new functions
- `app/api/settings/route.ts` — ensure `goalTime` is in the allowed fields (may already be there)

### Not changed
- `lib/workoutGenerators.ts` — already accepts `goalTimeSecs` (done in core engine)
- `lib/descriptionBuilder.ts` — already has `formatPaceStep` (done in core engine)
- `lib/settings.ts` — already has `goalTime` field (done in core engine)

## Pace preview computation

The pace preview in the wizard uses `getPaceTable(distanceKm, goalTimeSecs)` directly — no API call needed. It's a pure function that runs client-side. As the slider moves, recompute and display:

```typescript
const table = getPaceTable(selectedDist, sliderValueSecs);
// Display:
// Easy: formatPace(table.easy.min) – formatPace(table.easy.max) /km
// Race: formatPace(table.steady.min) – formatPace(table.steady.max) /km
// Intervals: formatPace(table.tempo.min) – formatPace(table.tempo.max) /km
```

Uses `formatPace()` from `lib/format.ts` (already exists — converts decimal min/km to "M:SS" string).

## Standard distance constants

Map standard distance buttons to exact km values:

| Button | km |
|--------|-----|
| 5K | 5.0 |
| 10K | 10.0 |
| Half | 21.0975 |
| Marathon | 42.195 |

"Other" uses the user's input directly.

## Open questions

None — all design decisions resolved during brainstorming.

## Out of scope

- Auto-update system (cardiac cost, race detection) — separate follow-up
- HRZonesStep changes — works as-is, de-emphasis is cosmetic and can wait
- Race name in wizard — lives only in PlannerConfigPanel
