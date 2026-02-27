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
- [ ] **Remove cached Intervals.icu profile data from `user_settings`.** `lthr`, `max_hr`, `hr_zones`, `profile_synced_at` are copies of `GET /api/v1/athlete/0`. Fetch from source instead. Only `intervals_api_key` (credential) needs to be stored.
- [ ] **Remove Intervals.icu activity metadata from `bg_cache`.** Columns `name`, `distance`, `duration`, `avg_pace`, `avg_hr`, `max_hr`, `load`, `carbs_ingested` duplicate data from the activity API. Keep only the streams (glucose, hr, pace, cadence, altitude) and computed values (start_bg, run_bg_context). `getRecentRunHistory` in `runAnalysisDb.ts` needs to join with Intervals.icu data at read time instead of reading stale scalars from cache.
- [x] ~~**Drop `distance`, `duration`, `avg_hr` columns from live `run_feedback` table.**~~ Columns dropped from live Turso DB.
