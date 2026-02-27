# TODO

## Data Integrity

- [x] ~~**EventModal carbs bypass feedback DB.**~~ PATCH `/api/run-feedback` syncs carbs back to feedback DB after EventModal edit.
- [x] ~~**Long run distance encoded in name string, not a field.**~~ Added `distance?: number` to `WorkoutEvent`, populated by generators. `workoutMath.ts` uses field first, falls back to regex for old data.
- [x] ~~**`upsertEvents` is dead code.**~~ Removed.

## Bugs

## Features

## Tests

- [x] ~~Add test for missed workout detection (planned event in the past)~~ — `isMissedEvent` + `getEventStatusBadge` tests in `eventStyles.test.ts`
- [x] ~~Add test for race day event rendering in agenda and modal~~ — Race badge + name rendering in `EventModal.integration.test.tsx`
- [x] ~~Add test for drag-and-drop event rescheduling~~ — `useDragDrop.test.ts`: planned/completed drag, API success/failure, error clearing

## Cleanup

- [x] ~~Fix React prop warnings from Recharts mock in test output~~ — Filter non-HTML props in `setup-dom.ts` mock
- [x] ~~**Remove cached Intervals.icu profile data from `user_settings`.**~~ Dropped `lthr`, `max_hr`, `hr_zones`, `profile_synced_at`. Profile fetched from API on every settings load.
- [x] ~~**Remove Intervals.icu activity metadata from `bg_cache`.**~~ Dropped `name`, `distance`, `duration`, `avg_pace`, `avg_hr`, `max_hr`, `load`, `carbs_ingested`. `getRecentAnalyzedRuns` returns streams only; route joins with API data at read time.
- [x] ~~**Drop `distance`, `duration`, `avg_hr` columns from live `run_feedback` table.**~~ Columns dropped from live Turso DB.
