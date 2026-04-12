# Settings Redesign

**Status:** PR 1 merged. PR 2 ready for implementation.

## What PR 1 delivered

- `goalTime` fully removed (code, types, DB column, UI, tests)
- Training paces from ability only (Runna model)
- `racePacePerKm` uses ability-derived threshold via `getThresholdPace()`
- `computeZonePacePct` deleted, `makeStep` collapsed to plain function
- GoalStep collects race date, AbilityStep is pure fitness
- PacePreview shared component
- HR zones section in SettingsModal (maxHR editable + computed zones)
- Training section in SettingsModal (ability slider + race dist/date + pace preview)
- Sync error feedback on Intervals.icu failures
- handleSave wrapped in try/finally
- MSW handlers + test coverage for new features

## What PR 2 delivers

Replace the 688-line SettingsModal (24 state vars) with a `/settings` page route + four tab components.

### Container: full settings page

| Tab | Component | Content |
|-----|-----------|---------|
| Training | `TrainingTab.tsx` | Fitness slider + pace preview, race goal card (option B — gold info card) |
| Zones | `ZonesTab.tsx` | Max HR input + HR zone display |
| Plan | `PlanTab.tsx` | Total weeks, start km, base phase, warmth |
| Account | `AccountTab.tsx` | Intervals.icu, sugar mode + nightscout, notifications, sign out |

### What already exists in SettingsModal (extract, don't rewrite)

The modal already has all the UI for every tab. PR 2 is a **decomposition**, not a feature build:

- Training section (lines 304-396): ability picker + race dist/date + PacePreview → extract to TrainingTab
- HR Zones section (lines 398-432): maxHR input + zone display → extract to ZonesTab
- Plan section (lines 434-470): weeks, km → extract to PlanTab
- Base phase toggle (lines 472-512) → extract to PlanTab
- Warmth (lines 514-558) → extract to PlanTab
- Account (Intervals.icu: lines 210-270, Sugar mode: lines 560-629, Notifications: lines 631-658) → extract to AccountTab
- Save handler logic: each tab gets its own save, with relevant Intervals.icu sync

### Training tab UX (option B)

Two visually distinct sections:

**Fitness** (interactive slider — purple):
- Distance pills (5K / 10K / Half / Marathon)
- Large time display + slider
- Pace preview (PacePreview component)

**Race goal** (static info card — gold):
- Gold border, visually distinct
- Shows: distance, date, weeks countdown
- "Edit" link expands to distance picker (standard + custom km) + date input

### Navigation

Gear icon in `app/page.tsx` → `<Link href="/settings">`. Remove `showSettings` state, `SettingsModal` import, modal render block.

Settings page has a back button that returns to `/`.

### Auth gate

`/settings` requires auth. Redirect to `/setup` if onboarding incomplete.

### Save behavior

- Each tab has its own Save button
- Persist to DB via `PUT /api/settings`, then best-effort Intervals.icu sync
- Show inline success/error: "Saved" or "Saved. Intervals.icu sync failed — try again later."

## Files

**New:**
- `app/settings/page.tsx` — page route with tab nav
- `app/settings/TrainingTab.tsx`
- `app/settings/ZonesTab.tsx`
- `app/settings/PlanTab.tsx`
- `app/settings/AccountTab.tsx`

**Modified:**
- `app/page.tsx` — gear icon → Link, remove modal state + import + render

**Deleted:**
- `app/components/SettingsModal.tsx`

**Kept:**
- `app/components/PacePreview.tsx`

**Tests:**
- `app/settings/__tests__/TrainingTab.integration.test.tsx`
- `app/settings/__tests__/ZonesTab.integration.test.tsx`
- Migrate from `SettingsModal.integration.test.tsx` and `clothing.integration.test.tsx`
- Delete originals

## Out of scope

- Pace auto-update system — separate feature, separate spec
- Post-run reconciliation — separate feature, separate spec
- Schedule editing in settings — future tab addition
