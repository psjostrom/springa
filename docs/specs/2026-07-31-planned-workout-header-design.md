# Planned Workout Modal Header

**Date:** 2026-07-31  
**Status:** Approved

## Problem

The planned-workout modal header packs date, effort metric, Replace, Edit, Delete, and close into one crowded row. “Edit” only moves the workout to another date/time, so the label overpromises.

## Goals

- Keep date, effort metric, replace, move, and delete available for future planned workouts.
- Make move discoverable without a misleading “Edit” label.
- Free header space on mobile; keep everyday controls (date, metric) one tap away.
- Try two move entry points so we can drop the weaker one later.

## Non-goals

- Changing replace/delete confirmation flows or effort-metric re-emit logic.
- Redesigning completed-workout headers beyond removing the obsolete Edit affordance if present.
- Building a shared design-system menu package beyond what this modal needs.

## Design

### Idle header (future planned)

```
[Friday 31 July 2026 at 14:00 ›]   [By Pace ▾]  [⋯]  [✕]
W03 Long Intervals
Planned
```

| Control | Behavior |
| --- | --- |
| **Date** | Muted, clearly tappable (chevron or equivalent). Starts the existing datetime-local edit + Save/Cancel path. |
| **Effort metric** | Existing `EffortMetricSelect` (By Pace / Heart Rate / Feel). Future planned only; HR gating unchanged. |
| **⋯ menu** | Replace, Move, Delete. Move starts the same date-edit path as tapping the date. Delete keeps the existing confirm step. |
| **✕** | Close. Unchanged. |

While date is being edited or saved, Save/Cancel replace the metric + ⋯ cluster (same as today). Replace panel and delete confirm stay as they are.

### Dual move entry (intentional trial)

Both date tap and ⋯ → Move call the same `START_EDIT_DATE` path. Keep both until one proves unused; then remove the other in a follow-up.

### Completed / past planned

- No effort metric.
- No Replace / Move in the ⋯ menu when those actions are not available today.
- Delete remains available where it is today.
- Date is not a move control when move is not allowed (non-planned or otherwise gated the same as today’s Edit).

### Accessibility

- Date control: button (or equivalent) with an accessible name that includes the date and the action (e.g. “Move workout, Friday 31 July 2026 at 14:00”).
- ⋯ control: `aria-haspopup="menu"`, accessible name “Workout actions”.
- Menu items: Replace, Move, Delete with clear labels; Delete remains visually destructive inside the menu.
- WCAG AA contrast for muted date text and menu items in light and dark mode.

### Local / shared calendar state

Moving a workout (date save or drag-drop) must patch `calendarEventsAtom` as well as any local calendar copy, so enrichment refreshes do not restore the pre-move date. (Companion fix landed with this work.)

## Definition of done

- Planned future workout header matches the layout above; no “Edit” button.
- Date tap and ⋯ → Move both open date editing; Save persists via existing `updateEvent` path and shared-atom patch.
- Replace and Delete behavior unchanged aside from entry point.
- Integration tests cover: actions menu contents, Move from menu, date tap enters edit, no Edit label.
- Manual/mobile QA: open planned workout, use date tap and ⋯ Move once each, replace once, delete-cancel once.

## Out of scope follow-ups

- Drop date-tap or ⋯ Move after usage preference is clear.
- Icon-only destructive styling polish beyond existing Delete confirm.
