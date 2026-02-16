# Refactor Checklist

## High Priority

- [x] **1. Extract duplicate `getEventStyle` / `getEventIcon`** — Extracted to `lib/eventStyles.ts`. CalendarView, EventModal, and AgendaView now import from shared module.
- [x] **2. Fix date mutation in `workoutGenerators.ts`** — Replaced `new Date(date.setHours(...))` with `date-fns/set()` across all 7 call sites. No longer mutates original date.
- [x] **3. Fix race condition in stream data loading** — Added staleness guard (`cancelled` flag) with cleanup return in useEffect. Stale responses are discarded.
- [x] **4. Replace `any` type in `intervalsApi.ts:258`** — Added `IntervalsEvent` interface to `types.ts`. Typed `activities` and `events` arrays from API response, removed `eslint-disable` comment and redundant inline type annotations.
- [x] **5. Fix `events.sort()` mutation** — Changed `events.sort()` to `[...events].sort()` in `CalendarView.tsx` useMemo. Added integration test that freezes the state array to verify sort doesn't mutate in-place.

## Medium Priority

- [x] **6. Deduplicate workout description parsing** — Created shared `parseWorkoutSegments()` in `utils.ts` with `toMinutes()` and `parseSectionSegments()` helpers. `WorkoutStructureBar` and `estimateWorkoutDuration()` both consume the shared parser.
- [x] **7. Memoize day cell rendering** — Extracted `DayCell` as `React.memo` component in `app/components/DayCell.tsx`. CalendarView passes props; only cells whose props change re-render.
- [x] **8. Add tests for critical untested logic** — Added 10 tests to `workoutGenerators.test.ts` (day-of-week assignments, sandwich progression, distance growth, recovery/taper/race-test distances), 6 tests to `utils.test.ts` (`parseWorkoutSegments`, `estimateWorkoutDuration`), 4 tests to `intervalsApi.test.ts` (description merging, different-day non-matching, race event typing, activity type filtering). Total: 97 tests.
- [x] **9. Extract zone thresholds to shared constants** — Added `ZONE_THRESHOLDS`, `getZoneColor()`, `classifyZone()` to `constants.ts`. Updated `HRMiniChart`, `WorkoutStructureBar`, and `utils.ts` to use shared functions.

## Low Priority

- [x] **10. Document `cadence * 2` in `intervalsApi.ts`** — Added comment: "Garmin reports half-cadence (steps per foot); double to get full SPM".
- [x] **11. Add radix to `parseInt()` calls** — Added radix 10 across `utils.ts`, `analysis.ts`, `EventModal.tsx`, `useDragDrop.ts`.
- [x] **12. Clean up `isLoadingStreamData` prop** — Made optional with JSDoc comment documenting it's only relevant for completed events.
