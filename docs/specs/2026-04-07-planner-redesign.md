# Planner Tab Redesign

**Status:** Spec approved, ready for implementation.
**Branch:** `feat/karvonen-zone-fallback` (builds on PR #135 scheduling infra)

## Problem

The Planner tab has a prominent "Generate Plan" button that's dead weight after the first sync. Schedule configuration (run days, long run day) is set in the wizard and not editable afterwards. Club run config has no home. Race goal is buried in Settings. Uploading a new plan doesn't visually communicate that old future events are replaced.

## Goal

Make the Planner tab the single place for plan management: schedule config, race goal, generation, and adaptation.

## Design Decisions

- **No greeting.** No "Hey {displayName}" — waste of vertical space on mobile.
- **Race goal lives on Planner only.** Remove from Settings modal. One owner, one write path.
- **Collapsed config bar.** Schedule + race goal compressed into a one-line summary. Tap Edit to expand. Config is accessible but doesn't dominate the screen.
- **Schedule changes show a banner**, not auto-regenerate. "Schedule changed — Regenerate?" with a button. User stays in control.
- **New compact components for Planner config.** Don't reuse wizard ScheduleStep — it has navigation chrome that doesn't apply here. Share the logic (`assignDayRoles`, settings save), build purpose-built inline UI.

## Layout

### Summary Bar (collapsed — default state)

One-line bar at the top of the Planner tab:

```
4 days/wk · Long: Sun · EcoTrail 16km                    [Edit]
```

- When plan is active, appends green countdown: `· 9 wks to go`
- If no race goal: omit that segment
- If no long run day set: show "Long: auto"
- Tapping Edit expands to the config panel

### Config Panel (expanded — tap Edit)

Bordered panel replacing the summary bar. Save-on-change for each field. Contains:

1. **Run Days** — 7-day toggle grid (Mon–Sun). Same interaction as wizard.
2. **Long Run Day** — pill picker showing only selected run days. Auto-assigns speed to farthest day (circular distance). Shows hint: "Speed auto-assigned to Wed"
3. **Club Run** — toggle "I run with a club", then:
   - Day picker (selected run days minus long run day)
   - Three type pills: "Long run" / "Speed work" / "Varies"
   - If "Long run": long run day picker hides, club day becomes the long run day
   - If "Speed work": hint "Springa skips its own speed session"
   - If "Varies": no special behavior, Springa generates its own speed + long
4. **Race Goal** — inline fields: name (text), distance (number + km), date (date picker)
5. **Done** button to collapse back to summary

### Three UI States

**State 1: First Visit (no plan exists)**
- Summary bar
- Primary "Generate Plan" button (full-width, brand color)
- Empty state placeholder

**State 2: Plan Generated (preview, pre-upload)**
- Summary bar
- Weekly volume chart
- Workout list preview (first few workouts + "N more" count)
- ActionBar at bottom: "N workouts ready" + "Upload to Intervals.icu" button

**State 3: Plan Active (post-upload)**
- Summary bar with green countdown
- Secondary "Regenerate Plan" button (outline style)
- Volume chart with completed weeks in green, upcoming in brand purple
- Schedule-changed banner (amber, only when config differs from last generation)
- Adapt section (existing, unchanged)

### Schedule Changed Banner

Appears between summary bar and regenerate button when any schedule field changes after a plan has been uploaded:

```
[amber border] Schedule changed          [Regenerate]
```

Triggering fields: run days, long run day, club day, club type, race date, race distance.

## Delete Before Upload

`uploadToIntervals()` already deletes all future WORKOUT events before uploading new ones (date range: today to 1 year out). No additional delete logic needed — the server-side function handles it.

Both callers use this:
- Planner's Upload button → `uploadPlan()` → bulk route → `uploadToIntervals()`
- Wizard's `handleComplete()` sets `generatedPlanAtom`, user uploads from Planner

## Data Model

### DB Columns (new — must be added)

PR #135 added and then removed these in the same branch. They need to be re-added:
- `long_run_day INTEGER` — day of week (0=Sun, 6=Sat)
- `club_day INTEGER` — day of week
- `club_type TEXT` — "long" | "speed" | "varies"

Add to `SCHEMA_DDL` in `lib/db.ts` and run ALTER TABLE on production.

### UserSettings Type

Add to `lib/settings.ts` interface, `getUserSettings()` read, and `saveUserSettings()` write:
```typescript
longRunDay?: number;
clubDay?: number;
clubType?: string;
```

### assignDayRoles (new — must be re-implemented)

Was added in PR #135 commit `56b675b` then removed in `b4b08a3`. Re-implement in `lib/workoutGenerators.ts`:

`assignDayRoles(runDays, longRunDay, clubDay?, clubType?)` returns `Map<number, DayRole>`:
- Roles: `"long" | "speed" | "easy" | "club" | "free"`
- Speed placed on day farthest from long run (circular distance)
- Club with type "speed" → Springa skips its own speed session
- 5+ days → extras become "free" runs

The original implementation and tests exist in git history (commit `56b675b`) and can be cherry-picked.

## Files to Change

**Data model:**
- `lib/db.ts` — add `long_run_day`, `club_day`, `club_type` columns to `SCHEMA_DDL`
- `lib/settings.ts` — add `longRunDay`, `clubDay`, `clubType` to UserSettings type + read/write
- `app/api/settings/route.ts` — allow new fields in PUT

**Scheduling logic:**
- `lib/workoutGenerators.ts` — re-add `assignDayRoles()` and `DayRole` type (from git history `56b675b`)
- `lib/__tests__/workoutGenerators.test.ts` — re-add `assignDayRoles` tests

**UI:**
- `app/screens/PlannerScreen.tsx` — main redesign: summary bar, config panel, three states
- `app/components/ActionBar.tsx` — simplify, integrate into PlannerScreen's preview state
- `app/components/PlannerConfigPanel.tsx` — new: expanded config (run days, long run, club, race goal)
- `app/components/PlannerSummaryBar.tsx` — new: collapsed config summary
- `app/components/SettingsModal.tsx` — remove race goal fields (moved to Planner)

## Out of Scope

- Zone model changes (separate spec: `2026-04-07-zone-model-analysis.md`)
- Pace zones
- Workout content changes (descriptions, notes, etc.)
- Club run in wizard (stays deferred — power-user feature for Planner only)
