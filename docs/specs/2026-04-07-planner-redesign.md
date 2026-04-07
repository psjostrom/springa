# Planner Tab Redesign

**Status:** Spec ready, not started.
**Depends on:** PR #135 (wizard fixes + scheduling) must be merged first.
**Branch from:** main (after PR #135 merge)

## Problem

The Planner tab has a prominent "Generate Plan" button that's effectively dead after the first plan sync. Schedule configuration (run days, club run) is split between the wizard and Settings with no unified place to manage it. Uploading a new plan doesn't clear old future events, causing stale events to stack.

## Goal

Make the Planner tab the single place for plan management: schedule, race goal, generation, and adaptation.

## Current State

- **Generate Plan** button is always visible and prominent, even when a plan already exists
- Schedule config (run days, long run day) is set in wizard, not editable afterwards
- Club run config was removed from wizard (too complex for onboarding) — has no home yet
- `uploadPlan()` POSTs new events without deleting old future planned events
- Race goal (date, distance, name) lives in Settings modal only
- `displayName` is collected in wizard but never shown to the user

## Design

### Layout (top to bottom)

1. **Greeting** — "Hey {displayName}" or similar. Personal touch, uses the collected name.

2. **Schedule Config** — inline-editable, saves on change:
   - Run days (same grid as wizard)
   - Long run day (pill picker from selected days)
   - Club run toggle + config (see below)

3. **Race Goal** — inline-editable:
   - Race name (text input)
   - Race date (date picker)
   - Distance in km (number input)

4. **Generate / Regenerate** button:
   - First time (no plan exists): "Generate Plan" with primary styling
   - Plan exists: "Regenerate Plan" with secondary styling + confirmation
   - **Must delete all future planned events before uploading new ones**

5. **Volume chart + workout preview** (existing, unchanged)

6. **Adapt section** (existing, unchanged)

### Club Run Config

Moved from wizard to Planner. Three-option model:

- **"It's my long run"** — club day becomes the long run day. Springa generates speed + easy on other days. The separate long run day picker hides (club day IS the long run day).
- **"It's my speed work"** — Springa skips its own speed session on other days. Avoids double speed weeks.
- **"It varies / I don't know"** — safe default. Springa generates its own speed + long as if club doesn't exist. If club happens to do intervals, runner can skip Springa's speed that week.

UI flow:
1. Toggle: "I run with a club"
2. Day picker (from selected run days, excluding long run day unless "it's my long run")
3. Three pills: "It's my long run" / "It's my speed work" / "It varies"

### Delete Before Upload

When generating/regenerating a plan:

1. Fetch all future planned events from Intervals.icu calendar
2. Delete them (batch or individual DELETE calls)
3. Upload the new plan
4. Refresh the calendar view

This must happen in both:
- Planner's Generate/Regenerate button
- Wizard's `handleComplete` (initial plan generation)

Check `uploadToIntervals` in `lib/intervalsApi.ts` and the bulk upload route at `app/api/intervals/events/bulk/route.ts`. The Intervals.icu API supports deleting events by ID — we already have `deleteEvent` in `lib/intervalsClient.ts`.

### Schedule Changes Trigger Regeneration

When the user changes run days, long run day, or club config, the existing plan becomes invalid. Options:
- Auto-regenerate (aggressive)
- Show a banner: "Schedule changed. Regenerate your plan?" with a button (recommended)

## Files to Change

- `app/screens/PlannerScreen.tsx` — main redesign target
- `app/components/ActionBar.tsx` — may be simplified/merged into PlannerScreen
- `lib/intervalsClient.ts` — add `deleteFuturePlannedEvents()` function
- `app/api/intervals/events/bulk/route.ts` — add DELETE support or create separate route
- `lib/intervalsApi.ts` — check if Intervals.icu has a bulk delete API
- `lib/settings.ts` / `app/api/settings/route.ts` — already has club fields (long_run_day, club_day, club_type)

## Technical Context

### Scheduling Model (already implemented in PR #135)

`assignDayRoles(runDays, longRunDay, clubDay?, clubType?)` returns `Map<number, DayRole>`:
- Roles: `"long" | "speed" | "easy" | "club" | "free"`
- Speed placed on day farthest from long run (circular distance)
- Club with type "intervals" → Springa skips speed
- 5+ days → extras become "free" runs

`generatePlan()` accepts optional `scheduling` parameter:
```ts
scheduling?: {
  runDays?: number[];
  longRunDay?: number;
  clubDay?: number;
  clubType?: string;
}
```

### DB Columns (already added in PR #135)
- `long_run_day INTEGER`
- `club_day INTEGER`
- `club_type TEXT`

### Existing Callers of generatePlan/generateFullPlan
- `PlannerScreen.tsx` — already passes scheduling from settings
- `IntelScreen.tsx` — uses generateFullPlan, doesn't pass scheduling (fine for now)
- `VolumeTrendChart.tsx` — uses generateFullPlan, doesn't pass scheduling (fine for now)
- `WorkoutGenerator.tsx` — on-demand single workout generation
- `app/setup/page.tsx` — wizard completion

## Out of Scope

- Zone model changes (separate spec)
- Pace zones
- Workout content changes (descriptions, notes, etc.)
