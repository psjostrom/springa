# First-Run Experience

**Date:** 2026-04-05
**Status:** Design approved

## Problem

After completing the 7-step setup wizard, a new user lands on an empty Calendar tab. Intel widgets silently hide themselves, Coach shows BG-specific suggestions that don't apply, and there's no guidance on what to do next. The app doesn't crash, but it feels dead.

## Goals

- New users see immediate value after the wizard — a generated training plan ready to upload
- Empty states communicate what each feature needs to unlock, using ghost previews
- Non-diabetes users get a first-class experience — Springa minus diabetes, not Springa minus features
- Coach suggestions adapt to available data so every user gets relevant prompts

## Non-Goals

- Onboarding checklist or progressive milestone tracker
- Watch connection verification (Intervals.icu API key valid ≠ watch syncing)
- Changes to the wizard steps themselves (except renaming + reframing the diabetes step)

---

## 1. Wizard Completion → Auto-Generate Plan

The wizard's DoneStep generates the first training plan automatically.

**Flow:**
1. User taps "Get Started" on DoneStep → `handleComplete` in `setup/page.tsx` fires
2. DoneStep shows loading state: "Building your training plan..." with spinner
3. `handleComplete` calls `generatePlan()` using the wizard's local `data` state (hrZones, raceDate, raceDist, lthr) + defaults (totalWeeks=18, startKm=8, includeBasePhase=false, diabetesMode from wizard data). BG model is null for new users.
4. Stores generated `WorkoutEvent[]` in a shared Jotai atom (`generatedPlanAtom`)
5. Marks onboarding complete via `PUT /api/settings`
6. Redirects to `/?tab=planner`
7. PlannerScreen picks up the pre-generated plan on mount — renders WeeklyVolumeChart + WorkoutList + "Upload to Intervals.icu" button

Generation is client-side (pure function, no API call). The wizard's local state in `setup/page.tsx` has all required inputs by step 7 — settings atoms are NOT available during the wizard (they're hydrated by `useHydrateStore` on the home page).

**HR zones fallback:** If the user skipped HR zones in step 5 AND Intervals.icu didn't provide zones, auto-generation is skipped. The user lands on the Planner tab with the standard "HR zones not synced" message and the Generate button. This is an edge case — step 2 (IntervalsStep) typically imports zones from the Intervals.icu profile.

**Tab selection mechanism:** The redirect uses `/?tab=planner`. The home page's `parseTab` already reads the `tab` query param and sets `activeTab` accordingly. The `generatedPlanAtom` is populated before navigation so PlannerScreen has data immediately — no race condition (both pages share the same Jotai Provider in the root layout).

## 2. Upload Complete → Calendar Link

After successful upload, the status message becomes a link-button:

> "Uploaded X workouts — **View in Calendar →**"

Tapping "View in Calendar" switches to the Calendar tab. The tab switcher is controlled by state in `page.tsx` — Planner receives a callback prop (e.g., `onSwitchTab("calendar")`) or sets a shared atom.

**Calendar reload:** All tabs are pre-mounted but hidden in `page.tsx` (`className="hidden"`). Calendar data is fetched once via SWR on initial load. After upload, `handleUpload` must call `calendarReload()` (SWR mutate) so the Calendar tab shows the newly uploaded workouts when the user switches to it. The current `handleUpload` does NOT call `calendarReload()` — this is a bug fix included in this work.

## 3. Ghost Preview Empty States

A reusable `EmptyState` component wraps a faint ghost visual with an overlaid message.

**Component API:**
- `children` — ghost SVG/visual (unique per widget)
- `message` — overlay text string

**Ghost visual:** Simple inline SVGs at ~5-8% opacity suggesting the shape of the real widget. Not pixel-perfect — just enough to hint at what's coming. Message displayed in a semi-transparent background pill for readability.

**Where it applies:**

| Location | Ghost preview | Message |
|----------|--------------|---------|
| Intel tab (combined) | Faint chart lines + metric cards | "Complete your first run to unlock training insights" |
| Calendar (no events) | Faint monthly grid with placeholder blocks | "Generate a training plan to fill your calendar" |
| Simulate (diabetes, no BG model) | Faint BG curve line | "Complete a few runs with CGM data to unlock BG simulation" |

**What does NOT get a ghost state:**
- Planner — always has the Generate button
- Coach — always functional (suggestions adapt)
- Calendar after upload — has real events

## 4. Context-Aware Coach Suggestions

Replace the 4 hardcoded suggestions with a tagged suggestion pool.

**Suggestion structure:**
```ts
interface CoachSuggestion {
  text: string;
  requires: Array<'plan' | 'runs' | 'bgData' | 'bgModel' | 'race'>;
  weight: number; // higher = more likely to appear
}
```

**Selection:** `getCoachSuggestions(context)` filters pool to eligible suggestions based on available data, picks 4 prioritized by weight with light randomization so the set varies between visits.

**Pool categories (20-30 total suggestions):**

- **Always available:** General Springa capabilities, how things work
- **Requires plan:** This week's workouts, workout structure rationale, cooldown purpose
- **Requires race:** Race tracking, pacing, countdown
- **Requires runs:** Training load, recent run analysis, recovery, pace trends
- **Requires runs + bgData:** Fuel rate effectiveness, BG trends during runs, post-run spikes, BG comparison across categories
- **Requires bgModel:** Fuel rate adjustment recommendations, model confidence

**Context sources:** Reads existing atoms — `enrichedEventsAtom` (runs), `bgModelAtom` (BG), `settingsAtom` (race, plan), `diabetesModeAtom`. Pure function, no API call.

If the user skipped the race goal in the wizard, race-specific suggestions are excluded from the pool.

**Coach welcome text:** The subtitle adapts based on diabetes mode:
- Diabetes: "Ask about training, fueling, BG management, or upcoming workouts."
- Non-diabetes: "Ask about training, recovery, or upcoming workouts."

## 5. Rename sugarMode → diabetesMode

Mechanical rename across the entire codebase:

**Code changes:**
- `sugarModeAtom` → `diabetesModeAtom` (atoms)
- `sugarMode` → `diabetesMode` (all component props, variables, conditionals)
- `SugarModeStep` → `DiabetesStep` (wizard step component + file)
- Settings type field: `sugarMode` → `diabetesMode`

**Database:**
- Column rename: `sugar_mode` → `diabetes_mode` in `user_settings`
- Schema DDL update
- ALTER TABLE migration

**Wizard reframing:** The DiabetesStep heading changes from clinical disclosure to empowering framing:

- Heading: "Do you manage diabetes while running?"
- Subtitle: "Springa can track your blood glucose, optimize fuel rates, and help you run without lows or spikes."
- Yes → Nightscout URL + API secret setup
- No → skip to Done

## 6. Diabetes Mode Gating

Non-diabetes users never see:
- Fuel rate display on Planner
- Simulate tab in navigation
- BG widgets in Intel (BG Compact, BG Analysis, BG Patterns)
- BG-related Coach suggestions
- CurrentBGPill in header
- Nightscout connection in Settings

Non-diabetes users DO see:
- Full Calendar with all workout types
- Planner with Generate + Upload (no fuel rates)
- Intel with fitness, pace, volume, readiness widgets
- Coach with training-focused suggestions
- Settings (schedule, HR zones, race goal, Intervals.icu connection)

---

## Files Affected

**New files:**
- `app/components/EmptyState.tsx` — reusable ghost preview + message wrapper
- `lib/coachSuggestions.ts` — suggestion pool + selection logic

**Modified files:**
- `app/setup/DoneStep.tsx` — loading state UI ("Building your training plan...")
- `app/setup/SugarModeStep.tsx` → rename to `DiabetesStep.tsx`, new heading/subtitle
- `app/setup/page.tsx` — auto-generate plan in `handleComplete`, update step imports, redirect to `/?tab=planner`
- `app/page.tsx` — default to Planner tab on first visit, tab switch callback
- `app/screens/PlannerScreen.tsx` — pick up pre-generated plan, upload link-button, hide fuel rates for non-diabetes
- `app/screens/IntelScreen.tsx` — combined ghost empty state when no runs
- `app/screens/SimulateScreen.tsx` — ghost empty state when no BG model
- `app/screens/CalendarScreen.tsx` — ghost empty state fallback for no events
- `app/screens/CoachScreen.tsx` — use `getCoachSuggestions()` instead of hardcoded array
- `app/components/CurrentBGPill.tsx` — rename atom reference
- `app/components/TabNavigation.tsx` — filter Simulate tab based on diabetes mode
- `app/atoms.ts` — rename atom, add `generatedPlanAtom`
- `lib/settings.ts` — rename field
- `app/api/settings/route.ts` — rename field
- `lib/db.ts` — schema DDL update
- All files referencing `sugarMode`/`sugarModeAtom`

**Database migration:**
- `ALTER TABLE user_settings RENAME COLUMN sugar_mode TO diabetes_mode`
