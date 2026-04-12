# Settings Redesign

**Status:** Approved, ready for implementation plan.

## Problem

The settings modal grew from a small config panel into a 750-line God Object with 23 state variables. Two nearly-identical distance pickers confuse users. Goal time feeds into pace computation and produces nonsensical results for trail races (race pace slower than easy pace). The modal pattern can't hold this much content on mobile.

## Phasing

Two PRs to keep reviews manageable and reduce risk:

**PR 1 — Data model cleanup:** Remove `goalTime` from pace computation. Simplify wizard (move race date, remove goal time UI). Update `computeZonePacePct`, `makeStep`, `getPaceTable`. Update tests. No UI restructure — keep the modal for now.

**PR 2 — Settings page:** Replace modal with `/settings` page route. Four tab components. Delete `SettingsModal.tsx`. Update navigation. New tests.

## Decisions

### Data model: Runna approach

Training paces derive entirely from **current ability** (distance + time). Goal time is not used.

| Field | Purpose | Drives |
|-------|---------|--------|
| `currentAbilityDist` | Reference distance (5K/10K/HM/Marathon) | Pace table, threshold pace |
| `currentAbilitySecs` | Current time at reference distance | Pace table, threshold pace |
| `raceDist` | Race distance (standard or custom km) | Plan structure (long run km, race test, race day) |
| `raceDate` | Race date | Plan timing (weeks, phases, taper) |
| `goalTime` | **Removed from pace computation.** Column stays in DB. Existing values ignored. No UI to set it. |

`experience` level is collected in the wizard for computing default ability time via `getDefaultGoalTime()`. It's not stored in the DB — after the wizard it's gone. When the user changes ability distance in settings, the default time uses `"intermediate"` as fallback.

### `computeZonePacePct`: remove goal params

`computeZonePacePct(paceTable, goalDistKm, goalTimeSecs)` → `computeZonePacePct(paceTable)`.

Z3/steady defaults to 99-102% of threshold for all distances. The `goalDistKm` and `goalTimeSecs` parameters are removed entirely.

### `getPaceTable`: remove goal params

`getPaceTable(abilityDist, abilitySecs, goalDistKm?, goalTimeSecs?)` → `getPaceTable(abilityDist, abilitySecs)`.

Z3 always uses ability pace (`abilityPacePerKm`). The `steadyPace` ternary that checked for goal params is removed. The `PaceTableResult` type drops no fields — `z3` is still computed, just always from ability.

### Container: full settings page

Replace `SettingsModal.tsx` with a `/settings` page route. Four tabs, each its own component:

| Tab | Component | Content |
|-----|-----------|---------|
| Training | `TrainingTab.tsx` | Fitness slider + pace preview, race goal card |
| Zones | `ZonesTab.tsx` | Max HR input + HR zone display |
| Plan | `PlanTab.tsx` | Total weeks, start km, base phase, warmth |
| Account | `AccountTab.tsx` | Intervals.icu, sugar mode + nightscout, notifications, sign out |

### Navigation

The gear icon in `app/page.tsx` (line 165-169) currently opens the modal via `setShowSettings(true)`. Replace with `router.push("/settings")` (or a `<Link>`). Remove the `showSettings` state, the `SettingsModal` import, and the modal render block (lines 205-212).

The settings page has a back button/link that returns to `/` (calendar).

### Auth gate

`/settings` requires authentication (same as the main page). If the user hasn't completed onboarding, redirect to `/setup` — don't show a partial settings page.

### Training tab UX (option B)

Two visually distinct sections:

**Fitness** (interactive, changes often):
- Distance pills (5K / 10K / Half / Marathon)
- Large time display + slider
- Pace preview below (Easy / Steady / Intervals) via `PacePreview` component

**Race goal** (static card, changes rarely):
- Gold border, visually distinct from the purple fitness section
- Shows: distance, date, weeks countdown
- "Edit" link expands to distance picker (standard + custom km) + date input
- No goal time, no race name

### Zones tab

- Max HR: editable number input
- HR zones: computed from `computeMaxHRZones(maxHr)`, displayed as color-coded Z1-Z5 rows
- On save: push HR zones + maxHR to Intervals.icu via `/api/intervals/hr-zones`

### Plan tab

Existing content, unchanged:
- Total weeks + start km inputs
- Base phase toggle
- Warmth preference slider

### Account tab

Existing content, moved from modal:
- Intervals.icu API key management
- Sugar mode toggle + Nightscout URL/secret
- Notifications
- Sign out

### Save behavior

- Each tab has its own Save button
- On save: persist changed fields to DB via `PUT /api/settings`, then best-effort sync to Intervals.icu
- Show inline success/error message: "Saved" or "Saved. Intervals.icu sync failed — try again later."
- Don't block save on sync failure

### Intervals.icu sync on save

- **Training tab:** Push threshold pace (`hmEquivalentPacePerKm`) when ability changes
- **Zones tab:** Push HR zones + maxHR when maxHR changes
- Both awaited with try/catch, error shown inline

## Wizard changes

### GoalStep (revised)

Collects: race distance (standard + custom km), race date, experience level.

Race date moves here from AbilityStep — it's about the race, not fitness. Experience level stays (used for `getDefaultGoalTime()` on the next step).

### AbilityStep (simplified)

Collects: ability distance, ability time (slider), pace preview.

**Removed:** Goal time ("Just finish" / "Set a time" toggle + goal time slider), race date (moved to GoalStep).

`AbilityStep.onNext` payload changes: removes `goalTime` and `raceDate` (already saved by GoalStep).

### setup/page.tsx

- Remove `goalTimeSecs` from `generatePlan()` call
- Remove `goalTimeSecs` from threshold pace push
- GoalStep now saves `raceDate` via its own `fetch("/api/settings", ...)` before calling `onNext`

### Steps 4-8

No changes: Schedule, Intervals.icu, Diabetes, Watch, Done.

## Files

### PR 1 — Data model cleanup

**Modified:**
- `lib/workoutGenerators.ts` — remove `goalDistKm`/`goalTimeSecs` from `computeZonePacePct` and `makeStep`
- `lib/paceTable.ts` — remove `goalDistKm`/`goalTimeSecs` params from `getPaceTable`, remove `steadyPace` ternary
- `app/setup/GoalStep.tsx` — add race date input, save via API
- `app/setup/AbilityStep.tsx` — remove goal time UI + race date
- `app/setup/page.tsx` — remove goalTimeSecs from generatePlan config and threshold push
- `app/components/SettingsModal.tsx` — remove `goalTimeSecs`, `goalMode`, `customGoalDist` state + UI (temporary; file deleted in PR 2)
- `lib/__tests__/workoutGenerators.test.ts` — update `computeZonePacePct` tests (remove goal param cases, verify HM defaults)

### PR 2 — Settings page

**New:**
- `app/settings/page.tsx` — settings page route with tab navigation
- `app/settings/TrainingTab.tsx` — fitness slider + pace preview + goal card
- `app/settings/ZonesTab.tsx` — max HR + HR zone display
- `app/settings/PlanTab.tsx` — weeks, km, base phase, warmth
- `app/settings/AccountTab.tsx` — Intervals.icu, sugar mode, notifications, sign out

**Modified:**
- `app/page.tsx` — replace modal trigger with `/settings` navigation, remove `SettingsModal` import + state + render

**Deleted:**
- `app/components/SettingsModal.tsx`

**Kept:**
- `app/components/PacePreview.tsx` — shared pace display

**Tests:**
- `app/settings/__tests__/TrainingTab.integration.test.tsx`
- `app/settings/__tests__/ZonesTab.integration.test.tsx`
- Existing `SettingsModal.integration.test.tsx` and `clothing.integration.test.tsx` — migrate relevant tests to new tab test files, delete originals

## Out of scope

- Pace auto-update system (cardiac cost, race detection)
- Post-run reconciliation
- Karvonen HR zones (still using %maxHR model)
- Schedule editing in settings (run days, long run day, club) — future tab addition
- `goalTime` DB column removal — leave in schema, stop reading it
- `raceName` — exists in DB schema but is unused and has no UI. Not adding it.
