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

## Tech Debt

- [ ] **page.tsx is doing too many things.** Data fetching, routing, settings, and layout in one ~320-line file. Every new data source adds another hook + more props threaded to screens. IntelScreen has 27 props. Not painful yet (single user, 5 screens) but when adding a prop means touching 4+ files, extract a `DataProvider` context so screens consume shared data from context instead of props. No external state library needed — React Context is sufficient at this scale.

## Cleanup

- [x] ~~Fix React prop warnings from Recharts mock in test output~~ — Filter non-HTML props in `setup-dom.ts` mock
- [x] ~~**Remove cached Intervals.icu profile data from `user_settings`.**~~ Dropped `lthr`, `max_hr`, `hr_zones`, `profile_synced_at`. Profile fetched from API on every settings load.
- [x] ~~**Remove Intervals.icu activity metadata from `bg_cache`.**~~ Dropped `name`, `distance`, `duration`, `avg_pace`, `avg_hr`, `max_hr`, `load`, `carbs_ingested`. `getRecentAnalyzedRuns` returns streams only; route joins with API data at read time.
- [x] ~~**Drop `distance`, `duration`, `avg_hr` columns from live `run_feedback` table.**~~ Columns dropped from live Turso DB.
