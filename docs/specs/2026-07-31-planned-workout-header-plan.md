# Planned Workout Modal Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uncrowd the planned-workout modal header (tappable date + effort metric + ⋯ actions) and keep moved workouts from snapping back when shared calendar state refreshes.

**Architecture:** Keep EventModal’s existing date-edit state machine. Replace the Edit/Replace/Delete button row with a tappable date control and a small actions menu that dispatches the same START_EDIT_DATE / START_REPLACE / CONFIRM_DELETE actions. Patch `calendarEventsAtom` on successful date moves (modal + drag) so enrichment refreshes do not restore the old date.

**Tech Stack:** Next.js App Router, React, Jotai, Vitest + Testing Library + MSW, Tailwind, lucide-react icons.

## Global Constraints

- Spec: `docs/specs/2026-07-31-planned-workout-header-design.md` (approved).
- Dual move entry is intentional: date tap and ⋯ → Move both start date editing.
- No “Edit” label anywhere in the planned-workout header.
- Do not change replace/delete confirm flows or effort-metric re-emit logic beyond entry points.
- WCAG AA contrast for muted date and menu items (light + dark).
- Tests: Vitest integration; no `vi.mock` / fetch mocking except project-allowed exceptions; use MSW.
- Work only under worktree `/Users/psjostrom/code/springa/.Codex/worktrees/planned-workout-header` on branch `feature/planned-workout-header`.
- Merge base for final review: `54a7342f7177da4640fa380c8a819bfcd5985da6` (`origin/main` at branch creation). Spec commit `dc5ee0a` is already on the branch.

---

### Task 1: Patch shared calendar atom on workout move

**Files:**
- Modify: `app/components/CalendarView.tsx` (`handleDateSaved`, `useDragDrop` call site)
- Modify: `app/hooks/useDragDrop.ts` (optional `onEventMoved` callback after successful PUT)
- Modify: `app/hooks/__tests__/useDragDrop.test.ts`
- Modify: `app/components/__tests__/CalendarView.integration.test.tsx`

**Interfaces:**
- Consumes: `patchCalendarEventAtom` from `app/atoms.ts` — `( { id: string; patch: Partial<CalendarEvent> } ) => void`
- Produces: `useDragDrop(setEvents, onEventMoved?: (eventId: string, newDate: Date) => void)` calls `onEventMoved` after successful `updateEvent` and before/with local `setEvents`

- [ ] **Step 1: Write the failing CalendarView integration test**

Add to `app/components/__tests__/CalendarView.integration.test.tsx` (import `format` from `date-fns` if missing):

```tsx
function CalendarAtomDateProbe({ eventId }: { eventId: string }) {
  const events = useAtomValue(calendarEventsAtom);
  const event = events.find((e) => e.id === eventId);
  return (
    <div
      data-testid="shared-calendar-date"
      data-date={event ? format(event.date, "yyyy-MM-dd") : "missing"}
    />
  );
}

it("keeps a moved workout on the new date after shared calendar data refreshes", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
  const event = futurePlannedEvent(); // existing helper; date 2026-02-16

  window.history.replaceState(null, "", "/?workout=event-123");

  const { rerender } = render(
    <>
      <CalendarView
        initialEvents={[event]}
        isLoadingInitial={false}
        initialError={null}
      />
      <CalendarAtomDateProbe eventId="event-123" />
    </>,
    { atomInits: [[calendarEventsAtom, [event]]] },
  );

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "W05 Easy + Strides" })).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: "Edit" })); // still Edit until Task 2
  const dateInput = screen.getByDisplayValue("2026-02-16T08:00");
  await user.clear(dateInput);
  await user.type(dateInput, "2026-02-15T08:00");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(screen.getByTestId("shared-calendar-date")).toHaveAttribute(
      "data-date",
      "2026-02-15",
    );
  });

  const movedEvent = { ...event, date: new Date("2026-02-15T08:00:00") };
  rerender(
    <>
      <CalendarView
        initialEvents={[movedEvent]}
        isLoadingInitial={false}
        initialError={null}
      />
      <CalendarAtomDateProbe eventId="event-123" />
    </>,
  );

  expect(screen.getByTestId("shared-calendar-date")).toHaveAttribute(
    "data-date",
    "2026-02-15",
  );
  expect(capturedPutPayload?.body).toEqual({
    start_date_local: "2026-02-15T08:00:00",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/components/__tests__/CalendarView.integration.test.tsx -t "keeps a moved workout"`

Expected: FAIL — `shared-calendar-date` stays `2026-02-16` because `handleDateSaved` does not patch the atom.

- [ ] **Step 3: Implement atom patch on modal save and drag**

In `CalendarView.tsx`:

```tsx
const handleDateSaved = (eventId: string, newDate: Date) => {
  patchCalendarEvent({ id: eventId, patch: { date: newDate } });
  setEvents((prev) =>
    prev.map((e) => (e.id === eventId ? { ...e, date: newDate } : e)),
  );
};

// useDragDrop call:
} = useDragDrop(setEvents, (eventId, newDate) => {
  patchCalendarEvent({ id: eventId, patch: { date: newDate } });
});
```

In `useDragDrop.ts`, add optional second arg and invoke after successful update:

```ts
export function useDragDrop(
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>,
  onEventMoved?: (eventId: string, newDate: Date) => void,
) {
  // ...
  await updateEvent(numericId, { start_date_local: newDateLocal });
  // ... google sync ...
  onEventMoved?.(draggedEvent.id, newDate);
  setEvents((prev) =>
    prev.map((e) =>
      e.id === draggedEvent.id ? { ...e, date: newDate } : e,
    ),
  );
}
```

Update `useDragDrop.test.ts` drop test to pass `onEventMoved` spy and assert it was called with the new date (`format(..., "yyyy-MM-dd") === "2026-03-12"`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/components/__tests__/CalendarView.integration.test.tsx app/hooks/__tests__/useDragDrop.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/CalendarView.tsx app/hooks/useDragDrop.ts \
  app/components/__tests__/CalendarView.integration.test.tsx \
  app/hooks/__tests__/useDragDrop.test.ts
git commit -m "$(cat <<'EOF'
fix: keep moved workouts in shared calendar atom

EOF
)"
```

---

### Task 2: Planned workout header — tappable date + actions menu

**Files:**
- Create: `app/components/WorkoutActionsMenu.tsx` (⋯ menu UI)
- Modify: `app/components/EventModal.tsx` (header layout)
- Modify: `app/components/__tests__/EventModal.integration.test.tsx`
- Modify: `app/components/__tests__/CalendarView.integration.test.tsx` (Edit → date tap / Move after header change)

**Interfaces:**
- Consumes: existing `dispatch` actions `START_EDIT_DATE`, `START_REPLACE`, `CONFIRM_DELETE`; `format(event.date, "yyyy-MM-dd'T'HH:mm")` for start date string
- Produces: `WorkoutActionsMenu` props:

```ts
interface WorkoutActionsMenuProps {
  canReplace: boolean;
  canMove: boolean;
  disabled?: boolean;
  onReplace: () => void;
  onMove: () => void;
  onDelete: () => void;
}
```

- [ ] **Step 1: Write failing EventModal tests for the new header**

In `EventModal.integration.test.tsx`, update/add tests:

1. Future planned idle header has no button named `Edit`.
2. Date is a button whose accessible name matches `/Move workout/i`.
3. Opening ⋯ (`Workout actions`) shows menuitems Replace, Move, Delete.
4. Clicking Move (menu) shows the datetime-local input (same as today’s Edit).
5. Clicking the date button also shows the datetime-local input.
6. Update the existing “buttons stay enabled while Google sync pending” test: replace `getByRole("button", { name: "Edit" })` / Replace / Delete with assertions on Effort metric + Workout actions menu (and that Replace/Move/Delete appear inside the open menu, not disabled).

Minimal new assertions:

```tsx
it("opens date editing from the tappable date and from Move in the actions menu", async () => {
  const user = userEvent.setup();
  render(<StatefulEventModalHarness />); // future planned fixture

  expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Move workout/i }));
  expect(screen.getByDisplayValue(/T/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  await user.click(screen.getByRole("button", { name: "Workout actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Move" }));
  expect(screen.getByDisplayValue(/T/)).toBeInTheDocument();
});
```

Adapt harness/fixture names to match the file’s existing helpers (`futurePlannedEvent` / `StatefulEventModalHarness` as already used).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/components/__tests__/EventModal.integration.test.tsx -t "tappable date"`

Expected: FAIL — no Move workout button / Workout actions menu yet.

- [ ] **Step 3: Implement WorkoutActionsMenu + EventModal header**

Create `app/components/WorkoutActionsMenu.tsx`:

- Button with `aria-label="Workout actions"`, `aria-haspopup="menu"`, `aria-expanded`.
- Use `MoreHorizontal` from `lucide-react`.
- Menu: `role="menu"` with `role="menuitem"` for Replace (if `canReplace`), Move (if `canMove`), Delete.
- Delete menuitem uses error-tint text (`text-error` or existing destructive token).
- Close on outside click and Escape; disable when `disabled`.
- Follow existing popover patterns in the repo (local state + fixed overlay), keep it small — no new dependency.

In `EventModal.tsx` idle header for planned workouts:

- Replace the static date `<div>` with a `<button type="button">` showing the same formatted date plus a chevron (`ChevronRight` or `›`), `className` muted + hover, `aria-label={`Move workout, ${formattedDate}`}`.
- Only render as button when `effectiveSelectedEvent.type === "planned"` (same gate as today’s Edit). Otherwise keep plain text date.
- Keep `EffortMetricSelect` when `showEffortMetricSelect`.
- Remove Replace / Edit / Delete buttons from the idle row; render `<WorkoutActionsMenu … />` instead.
- Wire:

```tsx
onMove={() => {
  dispatch({
    type: "START_EDIT_DATE",
    date: format(effectiveSelectedEvent.date, "yyyy-MM-dd'T'HH:mm"),
  });
}}
onReplace={() => { dispatch({ type: "START_REPLACE" }); }}
onDelete={() => { dispatch({ type: "CONFIRM_DELETE" }); }}
canReplace={effectiveSelectedEvent.type === "planned"}
canMove={effectiveSelectedEvent.type === "planned"}
disabled={isChangingMetric}
```

- Date button `onClick` uses the same `START_EDIT_DATE` payload as `onMove`.
- Confirm/delete and date Save/Cancel clusters stay as today.
- Completed workouts: menu with Delete only (`canReplace`/`canMove` false), matching today’s Delete-only actions.

- [ ] **Step 4: Update CalendarView move test for new header**

In Task 1’s CalendarView test, replace `getByRole("button", { name: "Edit" })` with `getByRole("button", { name: /Move workout/i })` (or open ⋯ → Move).

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- app/components/__tests__/EventModal.integration.test.tsx \
  app/components/__tests__/CalendarView.integration.test.tsx \
  app/hooks/__tests__/useDragDrop.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/components/WorkoutActionsMenu.tsx app/components/EventModal.tsx \
  app/components/__tests__/EventModal.integration.test.tsx \
  app/components/__tests__/CalendarView.integration.test.tsx
git commit -m "$(cat <<'EOF'
feat: uncrowd planned workout header with move menu

EOF
)"
```

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| Tappable date → date edit | Task 2 |
| Effort metric stays visible | Task 2 |
| ⋯ Replace / Move / Delete | Task 2 |
| Dual move entry | Task 2 |
| No Edit label | Task 2 |
| Completed: Delete only, no move date button | Task 2 |
| Atom patch on move | Task 1 |
| Integration tests | Tasks 1–2 |
| Manual QA | Shipwright QA after verification |
