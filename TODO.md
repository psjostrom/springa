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

- [x] ~~**page.tsx is doing too many things.**~~ Migrated to Jotai atoms. Screens read data from atoms via `useAtomValue`, page.tsx is layout + routing only. `useHydrateStore` bridges existing hooks to atoms. IntelScreen went from 28 props to zero.
- [x] ~~**`updateWidgetLayoutAtom` swallows fetch errors.**~~ Debounced PUT now checks `res.ok` and catches network errors. Failures surface via `widgetSaveErrorAtom`, shown in IntelScreen edit mode. Clears on next successful save.

## Cleanup

- [x] ~~Fix React prop warnings from Recharts mock in test output~~ — Filter non-HTML props in `setup-dom.ts` mock
- [x] ~~**Remove cached Intervals.icu profile data from `user_settings`.**~~ Dropped `lthr`, `max_hr`, `hr_zones`, `profile_synced_at`. Profile fetched from API on every settings load.
- [x] ~~**Remove Intervals.icu activity metadata from `bg_cache`.**~~ Dropped `name`, `distance`, `duration`, `avg_pace`, `avg_hr`, `max_hr`, `load`, `carbs_ingested`. `getRecentAnalyzedRuns` returns streams only; route joins with API data at read time.
- [x] ~~**Drop `distance`, `duration`, `avg_hr` columns from live `run_feedback` table.**~~ Columns dropped from live Turso DB.

## Architecture: stored-derived columns

**Principle:** if we own the source of truth, derivations are computed on read, never persisted as cached columns. We persist only when:
- The source is third-party + rate-limited (Intervals.icu streams cached in `activity_streams.hr`/`pace`/etc.)
- The output is expensive to recompute (AI generations in `run_analysis`, `bg_patterns`)
- The data is the source itself (`bg_readings`, `user_settings`, `prerun_carbs`)

Survey of `activity_streams` columns identified two violations — pure derivations of locally-owned data, persisted in a way that can drift, get wiped, or require backfill on shape changes.

### `activity_streams.run_bg_context` — fixed in PR #192
Pre/post BG stats are computed on every read by `computeRunBGContextsForActivities` from Scout's batch endpoint. Column dropped from `SCHEMA_DDL` and from the live DB by `scripts/migrate-pump-during-runs.ts`. The corresponding `scripts/backfill-postrun-stats.ts` was deleted.

### `activity_streams.glucose` — TODO (next PR)
Glucose values aligned to HR sample timestamps via `alignHRWithBG(hr, bgReadings, runStartMs)`. Pure derivation of `bg_readings` + `hr` column. Same anti-pattern; same failure mode possible. Currently computed client-side in `useStreamCache.loadUncachedRuns` and shipped to the server, which stores it as JSON.

Fix shape: drop the column, compute alignment on demand. Consumer is mainly `EventModal`'s BG chart — could fetch raw `bg_readings` for the activity's window and align in the chart component, or include alignment in the on-read computation if needed elsewhere.

```sql
-- Run after the glucose follow-up ships
ALTER TABLE activity_streams DROP COLUMN glucose;
```

### `bgcache_v*` localStorage version pattern
`lib/activityStreamsCache.ts:LS_KEY = "bgcache_v8"`. Each schema change to the cached shape requires bumping this string and effectively wiping client localStorage caches. Once all derived data is computed on read, the cache becomes purely a perf optimization for the response and any stale data is corrected on next refetch. Consider whether the version string is still needed at all post-fix.
