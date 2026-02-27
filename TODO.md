# TODO

## Data Integrity

- [ ] **EventModal carbs bypass feedback DB.** `EventModal.tsx` calls `updateActivityCarbs` directly to Intervals.icu without updating the local feedback record. If carbs are edited from EventModal after feedback submission, `feedback.carbsG` goes stale. Report card is unaffected (reads from Intervals.icu), but the analysis prompt sees the stale feedback value.

- [ ] **Long run distance encoded in name string, not a field.** Distance lives only in the workout name (`W03 Sun Long (15km)`) and is extracted via regex `\((\d+)km\)` in `workoutMath.ts:50`. Not a first-class property on `WorkoutEvent`. If naming convention changes, distance extraction breaks silently.

- [ ] **`upsertEvents` is dead code.** `lib/intervalsApi.ts` — exported but never imported anywhere. Remove it.

## Bugs

## Features

## Tests

- [ ] Add test for missed workout detection (planned event in the past)
- [ ] Add test for race day event rendering in agenda and modal
- [ ] Add test for drag-and-drop event rescheduling

## Cleanup

- [ ] Fix React prop warnings from Recharts mock in test output
