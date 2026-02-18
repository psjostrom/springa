# Remaining Refactors

Audit from 2026-02-18. Items ranked by value.

## DONE

- ~~EventModal state explosion~~ → `ActionMode` enum (`f03b2de`)
- ~~AnalysisSection prop sprawl~~ → `fuelValues` + `onFuelChange` (`9237cc8`)
- ~~Zone color/label duplication~~ → `ZONE_COLORS` constant in constants.ts (`1694c5f`)
- ~~Repeated error UI pattern~~ → `<ErrorCard>` component (`9bb29e9`)

## LOW

- `streamPaths` in WorkoutStreamGraph computed every render — should be `useMemo`
- `parseWorkoutSegments` in utils.ts repeats the same regex/parse/push pattern 4 times for each section type
- No min/max validation on PlannerScreen number inputs (totalWeeks, startKm, raceDist)
- Magic numbers (24-month lookback, default 45min duration) scattered instead of in constants
- Non-null assertion in `getPaceForZone` fallback
