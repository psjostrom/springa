# Remaining Refactors

Audit from 2026-02-18. Items ranked by value.

## DONE

- ~~EventModal state explosion~~ → `ActionMode` enum (`f03b2de`)
- ~~AnalysisSection prop sprawl~~ → `fuelValues` + `onFuelChange` (`9237cc8`)
- ~~Zone color/label duplication~~ → `ZONE_COLORS` constant in constants.ts (`1694c5f`)
- ~~Repeated error UI pattern~~ → `<ErrorCard>` component (`9bb29e9`)

- ~~`streamPaths` memoization~~ → `useMemo` in WorkoutStreamGraph
- ~~Input validation~~ → `min`/`max` on SettingsModal number inputs
- ~~Magic numbers~~ → `CALENDAR_LOOKBACK_MONTHS`, `DEFAULT_WORKOUT_DURATION_MINUTES`, `ACTIVITY_HISTORY_DAYS` in constants.ts

## WONTFIX

- `parseWorkoutSegments` duplication — intentional; warmup single-step parsing is load-bearing
- Non-null assertion in `getPaceForZone` — safe; `FALLBACK_PACE_TABLE` is exhaustive over `HRZoneName`
