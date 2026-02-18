# Remaining Refactors

Audit from 2026-02-18. Items ranked by value.

## MEDIUM

### EventModal state explosion
11 `useState` calls managing mutually exclusive modes (editing date, editing carbs, confirming delete, closing). A mode enum + grouped sub-state would make invalid states unrepresentable and simplify the reset logic at line 81.

### AnalysisSection prop sprawl
9 props (3 analysis objects + 3 fuel values + 3 onChange handlers). Could collapse to `onFuelChange(type: 'interval' | 'long' | 'easy', value: number)` and a single fuel config object.

### Zone color/label duplication
Zone colors defined in `constants.ts` (`getZoneColor`), `WorkoutCard.tsx` (`ZONE_STYLES`), `FitnessInsightsPanel.tsx` (`FORM_ZONE_STYLES`), plus raw hex strings in ~5 components. One `ZONE_CONFIG` constant would cut maintenance cost.

### Repeated error UI pattern
ProgressScreen, CalendarView, and VolumeTrendChart all render near-identical error+retry cards. Extractable to an `<ErrorCard message={...} onRetry={...} />` component.

## LOW

- `streamPaths` in WorkoutStreamGraph computed every render — should be `useMemo`
- `parseWorkoutSegments` in utils.ts repeats the same regex/parse/push pattern 4 times for each section type
- No min/max validation on PlannerScreen number inputs (totalWeeks, startKm, raceDist)
- Magic numbers (24-month lookback, default 45min duration) scattered instead of in constants
- Non-null assertion in `getPaceForZone` fallback
