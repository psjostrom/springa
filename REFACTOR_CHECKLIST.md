# Refactor Checklist

## High Priority

- [x] **1. Extract duplicate `getEventStyle` / `getEventIcon`** — Extracted to `lib/eventStyles.ts`. CalendarView, EventModal, and AgendaView now import from shared module.
- [x] **2. Fix date mutation in `workoutGenerators.ts`** — Replaced `new Date(date.setHours(...))` with `date-fns/set()` across all 7 call sites. No longer mutates original date.
- [x] **3. Fix race condition in stream data loading** — Added staleness guard (`cancelled` flag) with cleanup return in useEffect. Stale responses are discarded.
- [x] **4. Replace `any` type in `intervalsApi.ts:258`** — Added `IntervalsEvent` interface to `types.ts`. Typed `activities` and `events` arrays from API response, removed `eslint-disable` comment and redundant inline type annotations.
- [x] **5. Fix `events.sort()` mutation** — Changed `events.sort()` to `[...events].sort()` in `CalendarView.tsx` useMemo. Added integration test that freezes the state array to verify sort doesn't mutate in-place.

## Medium Priority

- [ ] **6. Deduplicate workout description parsing** — `WorkoutStructureBar.tsx` and `estimateWorkoutDuration()` in `utils.ts` both parse descriptions with near-identical regex. Share a single parser.
- [ ] **7. Memoize day cell rendering** — `renderDayCell()` called 35+ times per month. Each runs regex parsing and segment generation. Extract to `React.memo` component.
- [ ] **8. Add tests for critical untested logic** — `fetchCalendarData()` event-activity matching, long run sandwich progression, date generation, drag-drop rescheduling.
- [ ] **9. Extract zone thresholds to shared constants** — `HRMiniChart.tsx`, `WorkoutStructureBar.tsx`, `utils.ts` each hardcode zone boundary percentages.

## Low Priority

- [ ] **10. Document `cadence * 2` in `intervalsApi.ts:291`** — Likely converting Garmin half-cadence to full SPM.
- [ ] **11. Add radix to `parseInt()` calls** — Throughout `utils.ts` and `WorkoutStructureBar.tsx`.
- [ ] **12. Clean up `isLoadingStreamData` prop** — Passed to `EventModal` but only used inside the `completed` block.
