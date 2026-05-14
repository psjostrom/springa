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

- [ ] **Confirm post-run hyper hypothesis with full runBGContext data.** The phase-aware fuel modeling investigation (see IDEAS.md "Phase-Aware Fuel Modeling") tested two of three predictions: drop rate attenuates after ~30 min (✓), Easy spends a larger fraction of run-time in pre-fuel territory (✓). The third — Easy runs accumulate post-run hyper because more of the ingested CHO arrives after the run ends — was **untested**: only 1 spike sample because the investigation script disabled `runBGContext` to skip Scout. Re-run with `withRunBGContext: true` (or query `bg_readings` directly for the 30-min post-end window per activity) and compare avg `spike30m` per category. If Easy spike >> Long spike, that's another argument for phase-aware modeling.
- [ ] **`activity_streams.glucose` is a derived cache.** HR-aligned glucose values are computed from `bg_readings` + `hr` (same shape as the deferred `run_bg_context` derivation — see IDEAS.md "Server-Owned `runBGContext` via Scout Batch"). Currently aligned client-side in `useStreamCache.loadUncachedRuns` and shipped server-side for storage. Same anti-pattern. Fix: drop the column, compute alignment on demand alongside the runBGContext rework. After both are gone, revisit whether the `bgcache_v*` localStorage versioning is still needed — it exists to evict caches on derived-shape changes.
- [x] ~~**page.tsx is doing too many things.**~~ Migrated to Jotai atoms. Screens read data from atoms via `useAtomValue`, page.tsx is layout + routing only. `useHydrateStore` bridges existing hooks to atoms. IntelScreen went from 28 props to zero.
- [x] ~~**`updateWidgetLayoutAtom` swallows fetch errors.**~~ Debounced PUT now checks `res.ok` and catches network errors. Failures surface via `widgetSaveErrorAtom`, shown in IntelScreen edit mode. Clears on next successful save.

## Cleanup

- [x] ~~Fix React prop warnings from Recharts mock in test output~~ — Filter non-HTML props in `setup-dom.ts` mock
- [x] ~~**Remove cached Intervals.icu profile data from `user_settings`.**~~ Dropped `lthr`, `max_hr`, `hr_zones`, `profile_synced_at`. Profile fetched from API on every settings load.
- [x] ~~**Remove Intervals.icu activity metadata from `bg_cache`.**~~ Dropped `name`, `distance`, `duration`, `avg_pace`, `avg_hr`, `max_hr`, `load`, `carbs_ingested`. `getRecentAnalyzedRuns` returns streams only; route joins with API data at read time.
- [x] ~~**Drop `distance`, `duration`, `avg_hr` columns from live `run_feedback` table.**~~ Columns dropped from live Turso DB.
