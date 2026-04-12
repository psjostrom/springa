# Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove goal time from pace computation (PR 1), then replace the settings modal with a tabbed settings page (PR 2).

**Architecture:** Training paces derive from current ability only (Runna model). Goal time is disconnected from pace computation. The 750-line SettingsModal is replaced by a `/settings` page with four tab components (Training, Zones, Plan, Account), each owning its own state.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, Jotai, Tailwind CSS

**Spec:** `docs/specs/2026-04-12-settings-redesign.md`

---

## PR 1 — Data Model Cleanup

### Task 1: Remove goal params from getPaceTable

**Files:**
- Modify: `lib/paceTable.ts`
- Test: `lib/__tests__/utils.test.ts` (if getPaceTable tested there — check first)

- [ ] **Step 1: Simplify getPaceTable signature and implementation**

Remove `goalDistKm` and `goalTimeSecs` params. Remove the `steadyPace` ternary — Z3 always uses `abilityPacePerKm`.

In `lib/paceTable.ts`, replace:

```ts
export function getPaceTable(
  abilityDistKm: number,
  abilitySecs: number,
  goalDistKm?: number,
  goalTimeSecs?: number,
): PaceTableResult {
  if (abilityDistKm <= 0 || abilitySecs <= 0) {
    throw new Error("Ability distance and time must be positive");
  }
  const abilityPacePerKm = abilitySecs / 60 / abilityDistKm;
  const hmEquivalentTimeSecs = getHmEquivalentTimeSecs(abilityDistKm, abilitySecs);
  const hmEquivalentPacePerKm = hmEquivalentTimeSecs / 60 / HM_DISTANCE_KM;

  const steadyPace = (goalTimeSecs && goalDistKm)
    ? goalTimeSecs / 60 / goalDistKm
    : abilityPacePerKm;

  return {
    z2: { min: hmEquivalentPacePerKm * 1.06, max: hmEquivalentPacePerKm * 1.17 },
    z3: { min: steadyPace * 0.98, max: steadyPace * 1.01 },
```

With:

```ts
export function getPaceTable(
  abilityDistKm: number,
  abilitySecs: number,
): PaceTableResult {
  if (abilityDistKm <= 0 || abilitySecs <= 0) {
    throw new Error("Ability distance and time must be positive");
  }
  const abilityPacePerKm = abilitySecs / 60 / abilityDistKm;
  const hmEquivalentTimeSecs = getHmEquivalentTimeSecs(abilityDistKm, abilitySecs);
  const hmEquivalentPacePerKm = hmEquivalentTimeSecs / 60 / HM_DISTANCE_KM;

  return {
    z2: { min: hmEquivalentPacePerKm * 1.06, max: hmEquivalentPacePerKm * 1.17 },
    z3: { min: abilityPacePerKm * 0.98, max: abilityPacePerKm * 1.01 },
```

- [ ] **Step 2: Fix all callers**

Search for `getPaceTable(` across the codebase. Every call site that passes 3 or 4 args must be updated to 2. Known callers:

- `lib/workoutGenerators.ts` — `buildContext` passes `config.raceDist, config.goalTimeSecs`. Remove those args.
- `app/setup/page.tsx` — already uses 2 args, no change needed.
- `app/components/SettingsModal.tsx` — already uses 2 args, no change needed.
- `app/setup/AbilityStep.tsx` — already uses 2 args, no change needed.

In `lib/workoutGenerators.ts`, find the `getPaceTable` call in `buildContext` and replace:

```ts
  if (config.currentAbilitySecs && config.currentAbilityDist) {
    paceTable = getPaceTable(
      config.currentAbilityDist,
      config.currentAbilitySecs,
      config.raceDist,
      config.goalTimeSecs,
    );
  }
```

With:

```ts
  if (config.currentAbilitySecs && config.currentAbilityDist) {
    paceTable = getPaceTable(
      config.currentAbilityDist,
      config.currentAbilitySecs,
    );
  }
```

- [ ] **Step 3: Run type checker and tests**

Run: `npx tsc --noEmit && npm test`

Expected: All pass. If any test was calling `getPaceTable` with goal args, fix those too.

- [ ] **Step 4: Commit**

```
feat: remove goal params from getPaceTable

Training paces now derive entirely from current ability.
Z3/steady uses ability pace, not goal race pace.
Eliminates trail race pace inversion bug.
```

---

### Task 2: Remove goal params from computeZonePacePct and makeStep

**Files:**
- Modify: `lib/workoutGenerators.ts`
- Modify: `lib/types.ts`
- Test: `lib/__tests__/workoutGenerators.test.ts`

- [ ] **Step 1: Update tests**

In `lib/__tests__/workoutGenerators.test.ts`, replace the `computeZonePacePct` describe block:

```ts
describe("computeZonePacePct", () => {
  it("returns HM defaults when paceTable is null", () => {
    const result = computeZonePacePct(null);
    expect(result.z2).toEqual({ min: 30, max: 88 });
    expect(result.z3).toEqual({ min: 99, max: 102 });
    expect(result.z4).toEqual({ min: 106, max: 111 });
    expect(result.walk).toEqual({ min: null, max: null });
    expect(result.z5).toEqual({ min: null, max: null });
  });

  it("returns steady 99-102 for any paceTable", () => {
    const table = getPaceTable(10, 3300);
    const result = computeZonePacePct(table);
    expect(result.z3).toEqual({ min: 99, max: 102 });
  });

  it("easy and tempo are fixed", () => {
    const table = getPaceTable(10, 3300);
    const result = computeZonePacePct(table);
    expect(result.z2).toEqual({ min: 30, max: 88 });
    expect(result.z4).toEqual({ min: 106, max: 111 });
  });
});
```

- [ ] **Step 2: Run tests to see the old goal-param tests fail**

Run: `npm test -- --reporter=verbose 2>&1 | grep -A2 "computeZonePacePct"`

Expected: The old "shifts steady down for slower goal" and "shifts steady up for faster goal" tests are replaced by the simpler ones above.

- [ ] **Step 3: Simplify computeZonePacePct and makeStep**

In `lib/workoutGenerators.ts`, replace `computeZonePacePct`:

```ts
export function computeZonePacePct(
  paceTable: PaceTableResult | null,
): Record<ZoneName | "walk", { min: number | null; max: number | null }> {
  if (!paceTable) return HM_ZONE_DEFAULTS;

  return {
    walk: { min: null, max: null },
    z1:   { min: null, max: null },
    z2:   { min: 30, max: 88 },
    z3:   { min: 99, max: 102 },
    z4:   { min: 106, max: 111 },
    z5:   { min: null, max: null },
  };
}
```

Replace `makeStep`:

```ts
function makeStep(paceTable: PaceTableResult | null) {
  const zonePct = computeZonePacePct(paceTable);
```

- [ ] **Step 4: Update all makeStep callers**

Four generator functions call `makeStep(ctx.paceTable, ctx.raceDist, ctx.goalTimeSecs)`. Change all to `makeStep(ctx.paceTable)`:

```
lib/workoutGenerators.ts:183  →  const s = makeStep(ctx.paceTable);
lib/workoutGenerators.ts:280  →  const s = makeStep(ctx.paceTable);
lib/workoutGenerators.ts:348  →  const s = makeStep(ctx.paceTable);
lib/workoutGenerators.ts:379  →  const s = makeStep(ctx.paceTable);
```

- [ ] **Step 5: Remove goalTimeSecs from PlanConfig, PlanContext, buildContext**

In `lib/workoutGenerators.ts`, remove from `PlanConfig` interface:
```ts
  goalTimeSecs?: number;  // DELETE this line
```

Remove from `buildContext` function:
```ts
    goalTimeSecs: config.goalTimeSecs,  // DELETE this line
```

In `lib/types.ts`, remove from `PlanContext` interface:
```ts
  goalTimeSecs?: number;  // DELETE this line
```

- [ ] **Step 6: Run all tests**

Run: `npx tsc --noEmit && npm test`

Expected: All tests pass.

- [ ] **Step 7: Commit**

```
refactor: remove goal time from pace zone computation

computeZonePacePct no longer adjusts Z3/steady based on
goal distance. Z3 is fixed at 99-102% of threshold.
Removes goalTimeSecs from PlanConfig and PlanContext.
```

---

### Task 3: Update wizard — GoalStep gets race date

**Files:**
- Modify: `app/setup/GoalStep.tsx`
- Modify: `app/setup/page.tsx`

- [ ] **Step 1: Add race date to GoalStep**

In `app/setup/GoalStep.tsx`, update the interface and component:

```ts
interface GoalStepProps {
  raceDist?: number;
  experience?: ExperienceLevel;
  raceDate?: string;
  onNext: (data: { raceDist: number; experience: ExperienceLevel; raceDate: string }) => void;
  onBack: () => void;
}
```

Add state and date input after the experience picker:

```ts
const [raceDate, setRaceDate] = useState(
  initialDate ?? format(addWeeks(new Date(), 18), "yyyy-MM-dd")
);
```

Add imports at top:
```ts
import { addWeeks, format, differenceInWeeks, parseISO, isBefore } from "date-fns";
```

Add the race date section after the experience picker, before the buttons:

```tsx
{/* Race date */}
{experience != null && (
  <div>
    <label className="block text-sm font-semibold text-muted mb-2">
      Race date
    </label>
    <div className="flex items-center gap-3">
      <input
        type="date"
        value={raceDate}
        min={format(addWeeks(new Date(), 12), "yyyy-MM-dd")}
        onChange={(e) => { setRaceDate(e.target.value); }}
        className="flex-1 px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
      />
      {raceDate && (() => {
        const weeks = differenceInWeeks(parseISO(raceDate), new Date());
        return weeks > 0 ? (
          <span className="text-sm font-medium text-brand whitespace-nowrap">
            {weeks} weeks
          </span>
        ) : null;
      })()}
    </div>
  </div>
)}
```

Update `canProceed` to include date validation (12-week minimum, matching the check AbilityStep had):
```ts
const dateTooSoon = raceDate ? isBefore(parseISO(raceDate), addWeeks(new Date(), 12)) : false;
const canProceed = selectedDist != null && experience != null && !dateTooSoon;
```

Update the Next button onClick:
```ts
onClick={() => {
  if (selectedDist && experience)
    onNext({ raceDist: selectedDist, experience, raceDate });
}}
```

- [ ] **Step 2: Update setup/page.tsx GoalStep callback**

In `app/setup/page.tsx`, update the GoalStep render (around line 201-209):

```tsx
<GoalStep
  raceDist={data.raceDist}
  experience={data.experience}
  raceDate={data.raceDate}
  onNext={(goal) => {
    updateData({
      raceDist: goal.raceDist,
      experience: goal.experience,
      raceDate: goal.raceDate,
    });
    setStep(6);
  }}
  onBack={() => { setStep(4); }}
/>
```

- [ ] **Step 3: Run type checker**

Run: `npx tsc --noEmit`

Expected: Clean (AbilityStep still accepts raceDate prop but won't use it — that's fixed in the next task).

- [ ] **Step 4: Commit**

```
feat: move race date from AbilityStep to GoalStep

Race date is about the race, not fitness.
GoalStep now collects: distance, experience, race date.
```

---

### Task 4: Simplify AbilityStep — remove goal time and race date

**Files:**
- Modify: `app/setup/AbilityStep.tsx`
- Modify: `app/setup/page.tsx`

- [ ] **Step 1: Simplify AbilityStep**

Remove `goalTime` and `raceDate` from the interface, state, and UI.

New interface:
```ts
interface AbilityStepProps {
  raceDist: number;
  experience: ExperienceLevel;
  currentAbilitySecs?: number;
  currentAbilityDist?: number;
  onNext: (data: {
    currentAbilitySecs: number;
    currentAbilityDist: number;
  }) => void;
  onBack: () => void;
}
```

Remove these state vars:
- `goalMode`
- `goalTimeSecs`
- `raceDate`

Remove these imports:
- `addWeeks, format, differenceInWeeks, parseISO, isBefore` from date-fns

Remove from JSX:
- The "Do you have a time goal for race day?" section (goal mode toggle + slider)
- The "Race-ready by" date section
- All `raceDate`-related references

Remove the API save from handleNext — make it a simple sync callback:
```ts
const canProceed = true; // ability always has defaults

return (
  // ... keep distance picker + slider + PacePreview ...
  <button
    onClick={() => {
      onNext({
        currentAbilitySecs: abilitySecs,
        currentAbilityDist: abilityDist,
      });
    }}
  >Next</button>
);
```

Note: AbilityStep currently saves to `/api/settings` in its handleNext. Remove that — the wizard orchestrator saves all fields at once in handleComplete.

- [ ] **Step 2: Update setup/page.tsx**

Update the AbilityStep render to match the simplified interface:

```tsx
{step === 6 && data.experience && (
  <AbilityStep
    raceDist={data.raceDist}
    experience={data.experience}
    currentAbilitySecs={data.currentAbilitySecs}
    currentAbilityDist={data.currentAbilityDist}
    onNext={(ability) => {
      updateData({
        currentAbilitySecs: ability.currentAbilitySecs,
        currentAbilityDist: ability.currentAbilityDist,
      });
      setStep(7);
    }}
    onBack={() => { setStep(5); }}
  />
)}
```

Remove `goalTime` from `WizardData` interface.

Remove `goalTimeSecs: data.goalTime` from `generatePlan` call.

Merge ability/race data into the existing onboardingComplete save (don't add a separate fetch):

```ts
const res = await fetch("/api/settings", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    onboardingComplete: true,
    currentAbilitySecs: data.currentAbilitySecs,
    currentAbilityDist: data.currentAbilityDist,
    raceDist: data.raceDist,
    raceDate: data.raceDate,
  }),
});
```

- [ ] **Step 3: Run type checker and full tests**

Run: `npx tsc --noEmit && npm test`

Expected: All pass.

- [ ] **Step 4: Commit**

```
refactor: simplify AbilityStep — remove goal time and race date

AbilityStep now collects only: ability distance + time.
Race date moved to GoalStep. Goal time removed entirely.
```

---

### Task 5: Simplify SettingsModal (temporary, deleted in PR 2)

**Files:**
- Modify: `app/components/SettingsModal.tsx`

- [ ] **Step 1: Remove goal time state and UI**

Remove these state variables:
- `goalTimeSecs`
- `goalMode`
- `customGoalDist`

Keep:
- `goalDist` (race distance — still needed)
- `raceDate` (race date — still needed)
- `abilityDist`, `abilitySecs` (fitness)
- `maxHr` (HR zones)

Remove from JSX:
- The "Just finish" / "Set a time" toggle buttons
- The goal time slider (`goalMode === "time" && goalTimeSecs > 0`)

Remove from save handler:
- The `goalMode` conditional for `goalTime`
- `updates.goalTime = ...` lines

Keep in save handler:
- `goalDist` → `updates.raceDist`
- `raceDate` → `updates.raceDate`
- Ability + HR sync logic

- [ ] **Step 2: Run type checker and tests**

Run: `npx tsc --noEmit && npm test`

Expected: All pass.

- [ ] **Step 3: Commit**

```
refactor: remove goal time from settings modal

Goal time no longer drives any computation.
Settings shows race distance + date but no time target.
```

---

### Task 6: Verify everything and final commit

- [ ] **Step 1: Run full verification**

Run: `npx tsc --noEmit && npm run lint && npm test`

Expected: All pass — 0 TypeScript errors, 0 lint errors, all tests green.

- [ ] **Step 2: Verify no remaining goalTimeSecs references in production code**

Run: `grep -r "goalTimeSecs\|goalTime" lib/ app/ --include="*.ts" --include="*.tsx" | grep -v test | grep -v node_modules | grep -v ".next"`

Expected: Only `lib/settings.ts` (DB read/write — column stays) and `lib/db.ts` (schema DDL). No usage in generators, pace table, wizard, or settings.

- [ ] **Step 3: Create PR**

Branch: `feat/settings-redesign-data-model` (or use current branch)

---

## PR 2 — Settings Page (outline)

> Implementation plan for PR 2 should be written after PR 1 merges, since the codebase will have changed. Below is a task outline for reference.

### Task 7: Create settings page route and tab shell

**Files:** `app/settings/page.tsx`

Server component with auth check + onboarding redirect. Fetches settings, renders client tab component.

### Task 8: TrainingTab component

**Files:** `app/settings/TrainingTab.tsx`

Fitness slider (distance pills + time slider + PacePreview). Gold race goal card with edit expansion (distance picker + date input). Per-tab Save button with Intervals.icu threshold sync + inline error.

### Task 9: ZonesTab component

**Files:** `app/settings/ZonesTab.tsx`

Max HR number input. Computed HR zone display (color-coded Z1-Z5). Save pushes HR zones + maxHR to Intervals.icu.

### Task 10: PlanTab component

**Files:** `app/settings/PlanTab.tsx`

Move total weeks, start km, base phase toggle, warmth preference from modal. Same UI, own component.

### Task 11: AccountTab component

**Files:** `app/settings/AccountTab.tsx`

Move Intervals.icu API key, sugar mode + nightscout, notifications, sign out from modal.

### Task 12: Replace modal trigger with navigation

**Files:** `app/page.tsx`

Gear icon → `<Link href="/settings">`. Remove `showSettings` state, `SettingsModal` import, modal render block.

### Task 13: Delete SettingsModal and migrate tests

**Files:**
- Delete: `app/components/SettingsModal.tsx`
- Delete: `app/components/__tests__/SettingsModal.integration.test.tsx`
- Migrate: `app/components/__tests__/clothing.integration.test.tsx` warmth tests → PlanTab test
- New: `app/settings/__tests__/TrainingTab.integration.test.tsx`
- New: `app/settings/__tests__/ZonesTab.integration.test.tsx`

### Task 14: Final verification and PR
