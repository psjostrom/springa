# On-Demand Workout Generator — Implementation Plan

- **Design spec:** [`docs/specs/2026-03-27-on-demand-workout-generator.md`](./2026-03-27-on-demand-workout-generator.md)
- **Prerequisite PR:** [#114 — Fix predicted carbs](https://github.com/psjostrom/springa/pull/114)

## Prerequisites

- Merge PR #114 (predicted carbs fix) first — the `recalcTotalCarbs` enrichment ensures generated workouts show correct carbs immediately.

## Task Overview

| # | Task | Files | Depends on |
|---|------|-------|------------|
| 1 | Extract `generateSingleWorkout` | `lib/workoutGenerators.ts` | — |
| 2 | Add `createSingleEvent` API function | `lib/intervalsApi.ts` | — |
| 3 | Remove `generateClubRun` from plan | `lib/workoutGenerators.ts` | 1 |
| 4 | Build `WorkoutGenerator` component | `app/components/WorkoutGenerator.tsx` | 1, 2 |
| 5 | Integrate into `EventModal` | `app/components/EventModal.tsx` | 4 |
| 6 | Integrate into `AgendaView` | `app/components/AgendaView.tsx` | 4 |
| 7 | Integrate into `DayCell` / `CalendarView` | `app/components/DayCell.tsx`, `CalendarView.tsx` | 4 |
| 8 | Tests | `lib/__tests__/`, `app/components/__tests__/` | 1–7 |

## Detailed Tasks

### Task 1: Extract `generateSingleWorkout`

**File:** `lib/workoutGenerators.ts`

Export `buildContext` and `getWeekPhase` (currently private). Add a new public function:

```ts
export type OnDemandCategory = "easy" | "quality" | "long" | "club";

export function generateSingleWorkout(
  category: OnDemandCategory,
  date: Date,
  bgModel: BGResponseModel | null,
  settings: {
    raceDate: string;
    raceDist: number;
    totalWeeks: number;
    startKm: number;
    lthr: number;
    hrZones: number[];
    includeBasePhase?: boolean;
  },
): WorkoutEvent | null
```

**Implementation:**
1. Build `PlanContext` via `buildContext`
2. Compute `weekStart = startOfWeek(date, { weekStartsOn: 1 })`
3. Compute `weekIdx` using `getWeekIdx(date, ctx.planStartMonday)` from `workoutMath.ts`
4. Compute `wp = getWeekPhase(ctx, weekIdx)`
5. Delegate to the appropriate generator:
   - `easy` → `generateEasyRun(ctx, weekIdx, weekStart, wp)` — override date to the requested date (not forced to Tuesday)
   - `quality` → `generateQualityRun(ctx, weekIdx, weekStart, wp)` — override date
   - `long` → `generateLongRun(ctx, weekIdx, weekStart, wp)` — override date
   - `club` → return Club Run stub (60min at 18:30, fuel rate from `ctx.fuelInterval`)
6. Override the returned event's `start_date_local` to the requested date (generators currently hardcode day-of-week offsets)
7. Set `external_id` to `ondemand-${format(date, "yyyy-MM-dd")}` to avoid colliding with plan IDs

**The existing generators hardcode the day offset** (`addDays(weekStart, 3)` etc). Two options:
- (a) Refactor generators to accept a date parameter → invasive, touches all generators
- (b) Let generators produce the event, then override `start_date_local` → simpler, minimal change

Go with **(b)** — override after generation. The date offset inside the generator only matters for guard clauses (`isBefore(date, raceDate)` etc), which we should skip for on-demand. Add a flag or check for on-demand mode in the guard.

Actually simplest: extract the body of each generator (the workout construction) into inner helpers, then call them from both the plan generator and the on-demand generator. But that's more refactoring than needed. Just override the date post-generation.

**Suggestion logic** (for the UI badge):

```ts
export function suggestCategory(
  date: Date,
  wp: WeekPhase,
): OnDemandCategory {
  const dayOfWeek = date.getDay(); // 0=Sun ... 6=Sat
  if (wp.isRecovery || wp.isTaper || wp.isBase || wp.isRaceTest) return "easy";
  if (dayOfWeek === 0) return "long";  // Sunday
  if (dayOfWeek === 4) return "quality"; // Thursday
  return "easy";
}
```

### Task 2: Add `createSingleEvent` API function

**File:** `lib/intervalsApi.ts`

```ts
export async function createSingleEvent(
  apiKey: string,
  workout: WorkoutEvent,
): Promise<number> // returns new event ID
```

**Implementation:**
- Use the same bulk endpoint but with a single-element array: `POST /athlete/0/events/bulk?upsert=true`
- No delete step — just create
- Parse response to get the new event ID
- Best-effort Google Calendar sync

Also add a `replaceWorkoutOnDate` that handles delete + create:

```ts
export async function replaceWorkoutOnDate(
  apiKey: string,
  existingEventId: number | undefined,
  workout: WorkoutEvent,
): Promise<void>
```

- If `existingEventId`, delete it via `deleteEvent`
- Create new via `createSingleEvent`
- Google Calendar sync

### Task 3: Remove `generateClubRun` from plan

**File:** `lib/workoutGenerators.ts`

- Remove `generateClubRun` from `generateWeekEvents` array
- Keep the function itself (used by `generateSingleWorkout` for `club` category)
- Remove `excludeFromPlan` field from `WorkoutEvent` type if no other users
- Thursday now only generates `generateQualityRun`

**Breaking change check:** Search for `excludeFromPlan` usage — if only Club Run uses it, remove from type. If other code checks it, keep it.

**Test updates:** `workoutGenerators.test.ts` — update tests that expect Club Run events in the generated plan.

### Task 4: Build `WorkoutGenerator` component

**File:** `app/components/WorkoutGenerator.tsx`

```tsx
interface WorkoutGeneratorProps {
  date: Date;
  existingEventId?: number;  // numeric Intervals.icu event ID (for replace)
  existingEventName?: string; // for context in the UI
  onGenerated: () => void;    // callback after sync
  onCancel: () => void;
}
```

**States (state machine):**
```
idle → picking → previewing → syncing → done
```

- **picking:** Category grid (Easy, Quality, Long, Club Run). "Suggested" badge from `suggestCategory`. Tap category → generate → move to previewing.
- **previewing:** Show generated workout via `WorkoutCard` (reuse existing component). "Sync to Intervals" + "Regenerate" + "Back" buttons.
- **syncing:** Spinner. Calls `replaceWorkoutOnDate`.
- **done:** Calls `onGenerated()` → parent reloads calendar.

**Data sources (from atoms via hooks):**
- `settingsAtom` → raceDate, raceDist, totalWeeks, startKm, lthr, hrZones, includeBasePhase
- `bgModelAtom` → bgModel for fuel rates
- `paceTableAtom` → for WorkoutCard preview
- `apiKeyAtom` → for API calls

**Renders inline** (not a separate modal). The parent decides where to render it.

### Task 5: Integrate into `EventModal`

**File:** `app/components/EventModal.tsx`

Add a new `EditMode` variant:
```ts
| { kind: "replacing" }
```

Add a "Replace" button in the idle actions (next to Edit/Delete) for planned events:
```tsx
{selectedEvent.type === "planned" && (
  <button onClick={() => dispatch({ type: "START_REPLACE" })}>
    Replace
  </button>
)}
```

When `editMode.kind === "replacing"`, render `WorkoutGenerator` below the header:
```tsx
{editMode.kind === "replacing" && (
  <WorkoutGenerator
    date={selectedEvent.date}
    existingEventId={parseEventId(selectedEvent.id)}
    existingEventName={selectedEvent.name}
    onGenerated={() => { handleClose(); calendarReload(); }}
    onCancel={() => dispatch({ type: "CANCEL" })}
  />
)}
```

Hide the rest of the modal content (workout card, readiness, etc.) while replacing.

### Task 6: Integrate into `AgendaView`

**File:** `app/components/AgendaView.tsx`

Currently the agenda renders events grouped by day. For **future dates within the plan window** that have no events, insert a "Generate workout" row.

**Props change:**
```tsx
interface AgendaViewProps {
  // ... existing props ...
  onGenerateWorkout?: (date: Date) => void;
  planWindow?: { start: Date; end: Date }; // only show "+" for dates within the plan
}
```

**Implementation:**
- Between day groups, for each future date without events (within plan window), render:
```tsx
<div className="border border-dashed border-border rounded-lg p-4 cursor-pointer"
     onClick={() => onGenerateWorkout?.(date)}>
  <span className="text-muted">+ Generate workout for {dayLabel}</span>
</div>
```

- `onGenerateWorkout` callback in `CalendarView` opens `EventModal` in "generate" mode, or renders `WorkoutGenerator` in a lightweight modal.

**Alternative:** Instead of computing empty days in AgendaView (complex), add a floating "+" button at the bottom that opens a date+category picker. Simpler to implement, works on all views.

**Decision:** Go with the inline approach for AgendaView (empty day rows). It's more discoverable and the implementation is straightforward — just fill gaps between event days.

### Task 7: Integrate into `DayCell` / `CalendarView`

**File:** `app/components/DayCell.tsx`, `app/components/CalendarView.tsx`

**DayCell:** Add a "+" button for empty future days within the plan window.

```tsx
interface DayCellProps {
  // ... existing props ...
  onGenerateWorkout?: (date: Date) => void;
  isInPlanWindow?: boolean;
}
```

In the cell, after the events list:
```tsx
{dayEvents.length === 0 && isInPlanWindow && isFuture && (
  <button onClick={(e) => { e.stopPropagation(); onGenerateWorkout?.(day); }}
          className="text-muted hover:text-brand text-lg">
    +
  </button>
)}
```

**CalendarView:** Thread `onGenerateWorkout` callback through to DayCell. When triggered, open a lightweight modal/popover with `WorkoutGenerator` for that date.

Add state:
```ts
const [generateDate, setGenerateDate] = useState<Date | null>(null);
```

Render `WorkoutGenerator` in a modal when `generateDate` is set. Reuse the same modal chrome as `EventModal` (slide-up on mobile).

### Task 8: Tests

**Unit tests:**
- `lib/__tests__/workoutGenerators.test.ts`:
  - `generateSingleWorkout` returns correct workout for each category
  - `generateSingleWorkout` respects week phase (recovery → easy even if quality requested)
  - `suggestCategory` returns correct suggestion per day/phase
  - Plan no longer includes Club Run events
  - `excludeFromPlan` field removed (if applicable)

- `lib/__tests__/intervalsApi.test.ts`:
  - `createSingleEvent` sends correct payload
  - `replaceWorkoutOnDate` deletes old + creates new

**Integration tests:**
- `app/components/__tests__/WorkoutGenerator.integration.test.tsx`:
  - Renders category picker with suggestion badge
  - Selecting category shows workout preview
  - Sync button calls API and triggers callback
  - Cancel returns to idle

- `app/components/__tests__/EventModal.integration.test.tsx`:
  - "Replace" button visible for planned events
  - "Replace" button hidden for completed events
  - Tapping Replace shows WorkoutGenerator inline

## Execution Order

Tasks 1–2 are independent and can be done in parallel. Task 3 depends on 1. Task 4 depends on 1+2. Tasks 5–7 depend on 4 and are independent of each other (can be parallelized). Task 8 runs throughout.

```
1 ──┬── 3 ──┐
    │       ├── 4 ──┬── 5
2 ──┘       │       ├── 6
            │       └── 7
            └── 8 (throughout)
```

## Out of Scope

- AI-driven category suggestion (deterministic logic only)
- Multi-workout-per-day support
- Changing the plan's weekly day assignments
- Predicted carbs accuracy (fixed in PR #114)
