# On-Demand Workout Generator

- **Implementation plan:** [`docs/specs/2026-03-27-on-demand-workout-plan.md`](./2026-03-27-on-demand-workout-plan.md)

## Problem

Thursday generates TWO mutually exclusive events: a quality session (Hills/intervals at 12:00) and a Club Run (18:30). Both land on the calendar, but only one gets done. When Intervals.icu auto-pairs the completed activity to the wrong event, pre-run carbs, fuel rates, and workout descriptions get lost.

The dual-event pattern is a workaround for a missing feature: the ability to generate a workout on demand for any given day.

## Solution

A single reusable **WorkoutGenerator** component that can generate a fitted workout for any date. The plan only emits one event per day. When the runner needs a different workout (Club Run cancelled, feeling good/bad, rest day turned run day), they generate one on demand.

## Design Principles

- **One event per day.** The plan never creates mutually exclusive alternatives.
- **Same brain as the plan.** The generator uses the same `PlanContext`, phase logic, BG model, and fuel rates as `generatePlan`.
- **Replace, not stack.** Generating a workout replaces the existing event on that day (if any). No dual events.
- **Single component.** One `WorkoutGenerator` component used from every entry point.

## Architecture

### 1. Generation function: `generateSingleWorkout`

Extracted from `workoutGenerators.ts`. Takes a date, category, and plan context. Returns a `WorkoutEvent`.

```ts
// lib/workoutGenerators.ts

export type WorkoutCategory = "easy" | "quality" | "long" | "club";

export function generateSingleWorkout(
  category: WorkoutCategory,
  date: Date,
  bgModel: BGResponseModel | null,
  raceDateStr: string,
  raceDist: number,
  totalWeeks: number,
  startKm: number,
  lthr: number,
  hrZones: number[],
  includeBasePhase?: boolean,
): WorkoutEvent | null
```

**Implementation:** Builds a `PlanContext` via existing `buildContext`, computes `weekIdx` and `WeekPhase` for the given date, then calls the appropriate existing generator:

| Category | Generator | Notes |
|----------|-----------|-------|
| `easy` | `generateEasyRun` | Uses the date's weekday, not forced to Tuesday |
| `quality` | `generateQualityRun` | Picks session type from speed rotation based on week |
| `long` | `generateLongRun` | Sandwich/easy based on phase |
| `club` | Returns a Club Run stub | 60min, 18:30, trail club session |

The existing private generators (`generateEasyRun`, etc.) already take `(ctx, weekIdx, weekStart, wp)`. `generateSingleWorkout` computes these from the date and delegates.

`buildContext` is already a separate function — just needs to be used here too.

### 2. Sync function: `replaceWorkoutOnDate`

Handles the Intervals.icu side: delete existing event(s) on the date, create the new one.

```ts
// lib/intervalsApi.ts

export async function replaceWorkoutOnDate(
  apiKey: string,
  date: Date,
  workout: WorkoutEvent,
  existingEventId?: number,  // if replacing a known event, delete it specifically
): Promise<void>
```

**Steps:**
1. If `existingEventId` provided, delete that event via `deleteEvent`
2. Upload the new workout via single-event POST to Intervals.icu
3. Best-effort Google Calendar sync

### 3. UI Component: `WorkoutGenerator`

Single reusable component. Renders inline (not a separate modal).

```tsx
interface WorkoutGeneratorProps {
  date: Date;
  existingEvent?: CalendarEvent;   // if replacing an event
  onGenerated: () => void;         // callback after sync (triggers calendar reload)
  onCancel: () => void;
}
```

**States:**
1. **Category picker** — grid of 3-4 options (Easy, Quality, Long, Club Run) with a "Suggested" badge on the plan-recommended category
2. **Preview** — shows the generated workout (name, description via WorkoutCard, fuel rate, duration)
3. **Syncing** — spinner while replacing on Intervals.icu
4. **Done** — triggers `onGenerated` callback

**Suggestion logic:** Based on plan position and day of week:
- Thursday in build phase → Quality suggested
- Sunday → Long suggested
- Tuesday → Easy suggested
- Recovery/taper week → Easy suggested regardless of day

### 4. Integration Points

#### A. EventModal — "Replace workout" button

Add a "Replace" button to the modal actions for planned events. Tapping it renders `WorkoutGenerator` inline in the modal, below the existing workout card.

```
EventModal.tsx:
  - Show "Replace" button next to Edit/Delete (planned events only)
  - When tapped, toggle WorkoutGenerator below the existing content
  - WorkoutGenerator.onGenerated → close modal, reload calendar
```

#### B. AgendaView — empty day row

For future dates with no events, render a dashed "Generate workout" row.

```
AgendaView.tsx:
  - Between day groups, for days without events that fall within the plan window
  - Tapping opens WorkoutGenerator inline (expands below the row)
  - Or: tapping opens the EventModal in "generate" mode
```

#### C. DayCell — empty day indicator (month/week views)

For empty future days within the plan window, show a small `+` button.

```
DayCell.tsx:
  - Small "+" icon in empty cells (future dates within plan window)
  - Tapping opens EventModal in "generate" mode for that date
  - Month view: just the icon (space is tight)
  - Week view: icon + "Generate" text (more space)
```

All three entry points open the same `WorkoutGenerator` component. The difference is just where it renders (inline in modal, inline in agenda, or via modal from DayCell).

### 5. Plan Generator Changes

- **Remove `generateClubRun`** from `generateWeekEvents`. Thursday only gets `generateQualityRun`.
- **Remove `excludeFromPlan` handling** if Club Run was the only user.
- **Export `buildContext` and `getWeekPhase`** — needed by `generateSingleWorkout`.
- **Export individual generators** as needed (or keep them private and route through `generateSingleWorkout`).

### 6. Data Flow

```
User taps "Replace" or "+" on empty day
  → WorkoutGenerator renders with date + plan context
  → User picks category (or accepts suggestion)
  → generateSingleWorkout(category, date, ...) → WorkoutEvent
  → Preview shown via WorkoutCard
  → User taps "Sync to Intervals"
  → replaceWorkoutOnDate(apiKey, date, workout, existingEventId?)
    → DELETE old event (if any)
    → POST new event
    → Google Calendar sync
  → onGenerated() → calendar reload → UI updates
```

## Tasks

1. **Extract `generateSingleWorkout`** from `workoutGenerators.ts` — export `buildContext`, `getWeekPhase`, add public function that delegates to existing generators
2. **Add `replaceWorkoutOnDate`** to `intervalsApi.ts`
3. **Build `WorkoutGenerator` component** — category picker, preview, sync flow
4. **Integrate into EventModal** — "Replace" button for planned events
5. **Integrate into AgendaView** — empty day rows with generate trigger
6. **Integrate into DayCell** — "+" button on empty future days
7. **Remove `generateClubRun`** from plan generation and the `excludeFromPlan` field
8. **Update tests** — new generation function, removed Club Run, integration tests for the component

## Pre-Run Carbs Fix

The dual-event pattern was the root cause of pre-run carbs getting lost. With one event per day, the pairing problem disappears — there's only one event to pair to, so `pairedEventId` always points to the right Turso row.

No code changes needed in the pre-run carbs system itself. The fix is structural: eliminating the condition that caused wrong pairings. Pre-run carbs are entered 10-30 min before the run — by that point the workout decision is already made, so replacements never happen after carbs are entered.

## Out of Scope

- Generating multiple workouts per day (one event per day constraint)
- Changing the plan's weekly structure (still Mon=off, Tue=easy, Thu=quality, Sat=bonus, Sun=long)
- AI-driven category suggestion (use deterministic plan logic for now)
- Predicted carbs / totalCarbs accuracy (separate fix — pipeline paceTable issue)
