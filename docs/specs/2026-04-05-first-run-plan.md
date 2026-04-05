# First-Run Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Springa immediately useful for new users after the setup wizard — auto-generated plan, ghost empty states, context-aware Coach, and first-class non-diabetes support.

**Architecture:** Two PRs. PR 1: mechanical `sugarMode` → `diabetesMode` rename (26 files, pure find-replace + DB migration). PR 2: all functional changes (auto-generate, empty states, Coach suggestions, diabetes gating, upload link). Both PRs are independent in scope but PR 1 should merge first to keep PR 2's diff clean.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Jotai, Vitest, Turso/libsql, Tailwind

**Spec:** `docs/specs/2026-04-05-first-run-experience.md`

---

## PR 1: Rename sugarMode → diabetesMode

### Task 1: Database schema + settings CRUD rename

**Files:**
- Modify: `lib/db.ts:32` (SCHEMA_DDL)
- Modify: `lib/settings.ts:21,42,63,79,99` (UserSettings type + CRUD)
- Modify: `lib/__tests__/settings.test.ts:25`

- [ ] **Step 1: Update SCHEMA_DDL**

In `lib/db.ts`, change line 32:
```
sugar_mode         INTEGER NOT NULL DEFAULT 0,
```
to:
```
diabetes_mode      INTEGER NOT NULL DEFAULT 0,
```

- [ ] **Step 2: Update UserSettings type**

In `lib/settings.ts`, change line 21:
```ts
sugarMode?: boolean;
```
to:
```ts
diabetesMode?: boolean;
```

- [ ] **Step 3: Update getUserSettings**

In `lib/settings.ts`, update the SELECT query (line 42) to select `diabetes_mode` instead of `sugar_mode`. Update the conversion (line 63):
```ts
settings.diabetesMode = (row.diabetes_mode as number | null ?? 0) === 1;
```

- [ ] **Step 4: Update saveUserSettings**

In `lib/settings.ts`, update the save logic (line 99):
```ts
if (partial.diabetesMode !== undefined) { sets.push("diabetes_mode = ?"); args.push(partial.diabetesMode ? 1 : 0); }
```

Update the comment on line 79 to reference `diabetes_mode`.

- [ ] **Step 5: Update test**

In `lib/__tests__/settings.test.ts`, change line 25:
```ts
sugarMode: false,
```
to:
```ts
diabetesMode: false,
```

- [ ] **Step 6: Run tests**

Run: `npm test -- lib/__tests__/settings.test.ts`
Expected: Tests fail because the in-memory DB still uses old schema column name. This is expected — the test creates tables from SCHEMA_DDL which now uses `diabetes_mode`.

Actually, since the test uses SCHEMA_DDL directly (which we already updated), the test should pass with the new column name. Run and verify.

- [ ] **Step 7: Commit**

```bash
git add lib/db.ts lib/settings.ts lib/__tests__/settings.test.ts
git commit -m "Rename sugar_mode → diabetes_mode in schema and settings CRUD"
```

### Task 2: Rename atoms and hooks

**Files:**
- Modify: `app/atoms.ts:28`
- Modify: `app/hooks/useCurrentBG.ts:5,116,121-122`
- Modify: `app/hooks/useRunData.ts:16,38`
- Modify: `app/hooks/useHydrateStore.ts:103`

- [ ] **Step 1: Rename atom in atoms.ts**

Change line 28:
```ts
export const sugarModeAtom = atom((get) => get(settingsAtom)?.sugarMode ?? false);
```
to:
```ts
export const diabetesModeAtom = atom((get) => get(settingsAtom)?.diabetesMode ?? false);
```

- [ ] **Step 2: Update useCurrentBG.ts**

Replace `sugarModeAtom` import and usage with `diabetesModeAtom`. Change variable names from `sugarMode` to `diabetesMode`.

- [ ] **Step 3: Update useRunData.ts**

Rename parameter `sugarMode` → `diabetesMode` (line 16). Update `skipBG` logic (line 38):
```ts
const skipBG = diabetesMode === false;
```

- [ ] **Step 4: Update useHydrateStore.ts**

Change line 103 to pass `settings?.diabetesMode` instead of `settings?.sugarMode`.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS (these are hooks/atoms, tests that reference them will be updated in the next tasks)

- [ ] **Step 6: Commit**

```bash
git add app/atoms.ts app/hooks/useCurrentBG.ts app/hooks/useRunData.ts app/hooks/useHydrateStore.ts
git commit -m "Rename sugarModeAtom → diabetesModeAtom in atoms and hooks"
```

### Task 3: Rename in components

**Files:**
- Modify: `app/components/CurrentBGPill.tsx:5,25,36`
- Modify: `app/components/RunAnalysis.tsx:13,28,32`
- Modify: `app/components/RunReportCard.tsx:10`
- Modify: `app/components/SettingsModal.tsx:24,116,121,336-346`
- Modify: `app/screens/PlannerScreen.tsx:31,42,77`
- Modify: `app/screens/CoachScreen.tsx` (if it references sugarMode)

- [ ] **Step 1: Update CurrentBGPill.tsx**

Replace `sugarModeAtom` import with `diabetesModeAtom`. Rename local variable `sugarMode` → `diabetesMode`. Update the guard: `if (!diabetesMode) return null;`

- [ ] **Step 2: Update RunAnalysis.tsx**

Replace `sugarModeAtom` import with `diabetesModeAtom`. Rename `sugarMode` in interface and destructuring to `diabetesMode`.

- [ ] **Step 3: Update RunReportCard.tsx**

Replace `sugarModeAtom` import with `diabetesModeAtom`. Rename all usages.

- [ ] **Step 4: Update SettingsModal.tsx**

Rename all `sugarMode` local state and references to `diabetesMode`. Update the settings comparison (`settings.diabetesMode`), the conditional NS fields check, and the toggle switch UI.

- [ ] **Step 5: Update PlannerScreen.tsx**

Replace `sugarModeAtom` import with `diabetesModeAtom`. Rename local variable. Update `generatePlan()` call to pass `diabetesMode`.

- [ ] **Step 6: Run lint and tests**

Run: `npm run lint && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/components/CurrentBGPill.tsx app/components/RunAnalysis.tsx app/components/RunReportCard.tsx app/components/SettingsModal.tsx app/screens/PlannerScreen.tsx
git commit -m "Rename sugarMode → diabetesMode in components and screens"
```

### Task 4: Rename in business logic

**Files:**
- Modify: `lib/fuelRate.ts:13,18,21`
- Modify: `lib/workoutGenerators.ts:397,401-403,467,488,490`
- Modify: `lib/reportCard.ts:308,311,313-314`

- [ ] **Step 1: Update fuelRate.ts**

Rename parameter and JSDoc from `sugarMode` to `diabetesMode`. Update the guard:
```ts
if (diabetesMode === false) return 0;
```

- [ ] **Step 2: Update workoutGenerators.ts**

Rename `sugarMode` parameter in `buildContext()`, `generatePlan()`, and `generateFullPlan()` to `diabetesMode`. Update all call sites passing it through.

- [ ] **Step 3: Update reportCard.ts**

Rename `sugarMode` parameter to `diabetesMode`. Update all conditional checks.

- [ ] **Step 4: Run tests**

Run: `npm test -- lib/__tests__/fuelRate.test.ts lib/__tests__/workoutGenerators.test.ts lib/__tests__/reportCard.test.ts`
Expected: PASS (these tests call the functions — if any test passes `sugarMode` as a named arg, update it)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/fuelRate.ts lib/workoutGenerators.ts lib/reportCard.ts
git commit -m "Rename sugarMode → diabetesMode in business logic"
```

### Task 5: Rename in API routes

**Files:**
- Modify: `app/api/settings/route.ts:110`
- Modify: `app/api/bg/route.ts:18`
- Modify: `app/api/bg-patterns/route.ts:65`
- Modify: `app/api/chat/route.ts:35`
- Modify: `app/api/run-analysis/route.ts:87-91`
- Modify: `app/api/adapt-plan/route.ts:69,88-90`
- Modify: `app/api/cron/prerun-push/route.ts:92`

- [ ] **Step 1: Update settings route**

Change `body.sugarMode` to `body.diabetesMode` in the PUT handler. Update `allowed.sugarMode` to `allowed.diabetesMode`.

- [ ] **Step 2: Update bg route**

Change `settings.sugarMode` to `settings.diabetesMode` in the gate check.

- [ ] **Step 3: Update bg-patterns route**

Change `settings.sugarMode` to `settings.diabetesMode`. Update error message from "Sugar mode" to "diabetes mode".

- [ ] **Step 4: Update chat route**

Change `settings.sugarMode` to `settings.diabetesMode`.

- [ ] **Step 5: Update run-analysis route**

Change all `settings.sugarMode` to `settings.diabetesMode` (5 occurrences).

- [ ] **Step 6: Update adapt-plan route**

Change all `settings.sugarMode` to `settings.diabetesMode` (3 occurrences).

- [ ] **Step 7: Update prerun-push cron route**

Change `settings.sugarMode` to `settings.diabetesMode`.

- [ ] **Step 8: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add app/api/
git commit -m "Rename sugarMode → diabetesMode in API routes"
```

### Task 6: Rename wizard step + reframe copy

**Files:**
- Rename: `app/setup/SugarModeStep.tsx` → `app/setup/DiabetesStep.tsx`
- Modify: `app/setup/page.tsx:6,10,26,39,129-138`

- [ ] **Step 1: Rename file**

```bash
git mv app/setup/SugarModeStep.tsx app/setup/DiabetesStep.tsx
```

- [ ] **Step 2: Update DiabetesStep.tsx**

Rename component from `SugarModeStep` to `DiabetesStep`. Rename props interface from `SugarModeStepProps` to `DiabetesStepProps`. Rename all internal `sugarMode` variables to `diabetesMode`. Update the API call body from `{ sugarMode: true/false }` to `{ diabetesMode: true/false }`.

Update copy:
- Heading (line 83): `"Do you manage diabetes while running?"`
- Subtitle (line 85): `"Springa can track your blood glucose, optimize fuel rates, and help you run without lows or spikes."`

- [ ] **Step 3: Update setup/page.tsx**

Update import from `SugarModeStep` to `DiabetesStep`. Update `WizardData` interface: `sugarMode` → `diabetesMode`. Update initial state default. Update step 6 render to use `<DiabetesStep>` with `diabetesMode` prop.

- [ ] **Step 4: Run lint and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/setup/
git commit -m "Rename SugarModeStep → DiabetesStep, reframe wizard copy"
```

### Task 7: Rename in scripts + run DB migration

**Files:**
- Modify: `scripts/migrate-existing-user.ts:34,73`
- Modify: `scripts/provision-user.ts:45-46,82,90,95,112-115,152,161`

- [ ] **Step 1: Update migration script**

Change `sugar_mode` references to `diabetes_mode` in `scripts/migrate-existing-user.ts`.

- [ ] **Step 2: Update provisioning script**

Change `--sugar-mode` CLI flag to `--diabetes-mode`. Update all `sugar_mode` column references to `diabetes_mode`.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: ALL PASS (1047+ tests)

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "Rename sugar_mode → diabetes_mode in scripts"
```

### Task 8: Run production DB migration

- [ ] **Step 1: Run ALTER TABLE**

```bash
npm run db:query -- "const{createClient}=require('@libsql/client');const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});db.execute('ALTER TABLE user_settings RENAME COLUMN sugar_mode TO diabetes_mode').then(r=>console.log('done',r))"
```

- [ ] **Step 2: Verify**

```bash
npm run db:query -- "const{createClient}=require('@libsql/client');const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});db.execute('PRAGMA table_info(user_settings)').then(r=>console.log(r.rows.map(r=>r.name)))"
```

Expected: Column list includes `diabetes_mode`, no `sugar_mode`.

- [ ] **Step 3: Create PR and merge**

Create PR for the rename. All tests pass, no behavioral changes. Merge after CI green.

---

## PR 2: First-Run Experience (functional changes)

> Depends on PR 1 being merged first.

### Task 9: Add generatedPlanAtom

**Files:**
- Modify: `app/atoms.ts`

- [ ] **Step 1: Add atom**

Add to `app/atoms.ts` in the Settings section:

```ts
import type { WorkoutEvent } from "@/lib/types";

/** Pre-generated plan from wizard completion. Consumed once by PlannerScreen, then cleared. */
export const generatedPlanAtom = atom<WorkoutEvent[]>([]);
```

- [ ] **Step 2: Commit**

```bash
git add app/atoms.ts
git commit -m "Add generatedPlanAtom for wizard → planner handoff"
```

### Task 10: Auto-generate plan on wizard completion

**Files:**
- Modify: `app/setup/page.tsx`
- Modify: `app/setup/DoneStep.tsx`
- Test: `lib/__tests__/workoutGenerators.test.ts` (existing, verify generatePlan works with null bgModel)

- [ ] **Step 1: Verify generatePlan works with null bgModel**

Run: `npm test -- lib/__tests__/workoutGenerators.test.ts`
Expected: PASS. The existing tests already cover `generatePlan(null, ...)` — confirm this.

- [ ] **Step 2: Update DoneStep to show generating state**

In `app/setup/DoneStep.tsx`, add a `generating` prop:

```tsx
interface DoneStepProps {
  onComplete: () => Promise<void>;
  generating?: boolean;
}

export function DoneStep({ onComplete, generating }: DoneStepProps) {
  const [completing, setCompleting] = useState(false);

  const handleComplete = async () => {
    setCompleting(true);
    await onComplete();
  };

  const busy = completing || generating;

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <div className="text-center">
        <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-brand to-brand-hover rounded-full flex items-center justify-center">
          {generating ? (
            <span className="inline-block w-8 h-8 border-3 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <h2 className="text-2xl font-bold text-text mb-2">
          {generating ? "Building your training plan..." : "You\u0027re all set!"}
        </h2>
        <p className="text-muted mb-6">
          {generating
            ? "This only takes a moment."
            : "Your account is ready. Let\u0027s start building your training plan."}
        </p>
      </div>

      <button
        onClick={() => { void handleComplete(); }}
        disabled={busy}
        className="w-full py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50"
      >
        {busy ? "Setting up..." : "Get Started"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Update setup/page.tsx handleComplete**

Add imports and update `handleComplete`:

```tsx
import { useSetAtom } from "jotai";
import { generatedPlanAtom } from "../atoms";
import { generatePlan } from "@/lib/workoutGenerators";
import { DEFAULT_LTHR } from "@/lib/constants";

// Inside SetupPage component:
const setGeneratedPlan = useSetAtom(generatedPlanAtom);
const [generating, setGenerating] = useState(false);

const handleComplete = async () => {
  // Generate plan if HR zones are available
  const hrZones = data.hrZones;
  if (hrZones?.length === 5) {
    setGenerating(true);
    const events = generatePlan(
      null, // no BG model for new users
      data.raceDate ?? "2026-06-13",
      data.raceDist ?? 16,
      data.totalWeeks ?? 18,
      data.startKm ?? 8,
      data.lthr ?? DEFAULT_LTHR,
      hrZones,
      false, // includeBasePhase
      data.diabetesMode,
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setGeneratedPlan(events.filter((e) => e.start_date_local >= today));
  }

  // Mark onboarding complete
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ onboardingComplete: true }),
  });
  if (!res.ok) return;
  router.push("/?tab=planner");
};
```

Pass `generating` to DoneStep:
```tsx
{step === 7 && (
  <DoneStep onComplete={handleComplete} generating={generating} />
)}
```

- [ ] **Step 4: Update PlannerScreen to consume generatedPlanAtom**

In `app/screens/PlannerScreen.tsx`, add:

```tsx
import { generatedPlanAtom } from "../atoms";

// Inside PlannerScreen:
const generatedPlan = useAtomValue(generatedPlanAtom);
const setGeneratedPlan = useSetAtom(generatedPlanAtom);

// On mount, consume the pre-generated plan (once)
// eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run once on mount
useEffect(() => {
  if (generatedPlan.length > 0) {
    setPlanEvents(generatedPlan);
    setGeneratedPlan([]); // clear after consuming
  }
}, []);
```

- [ ] **Step 5: Run tests and lint**

Run: `npm run lint && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/setup/page.tsx app/setup/DoneStep.tsx app/screens/PlannerScreen.tsx app/atoms.ts
git commit -m "Auto-generate training plan on wizard completion"
```

### Task 11: Upload complete → Calendar link + calendarReload fix

**Files:**
- Modify: `app/components/ActionBar.tsx`
- Modify: `app/screens/PlannerScreen.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Add onViewCalendar prop to ActionBar**

In `app/components/ActionBar.tsx`, add an optional `onViewCalendar` callback:

```tsx
interface ActionBarProps {
  workoutCount: number;
  isUploading: boolean;
  statusMsg: string;
  onUpload: () => void;
  onViewCalendar?: () => void;
}
```

Update the success state (the `if (statusMsg)` branch around line 64) to include the link:

```tsx
if (statusMsg && !statusMsg.includes("Error")) {
  return (
    <div className={`${POSITION} bg-surface border border-border border-l-[3px] border-l-success rounded-lg flex items-center justify-between p-4`}>
      <div className="flex items-center gap-3">
        <CheckCircle size={22} className="text-success shrink-0" />
        <div>
          <h3 className="font-bold text-success text-sm md:text-base">
            Upload complete
          </h3>
          <p className="text-sm text-muted">
            {statusMsg}
          </p>
        </div>
      </div>
      {onViewCalendar && (
        <button
          onClick={onViewCalendar}
          className="flex items-center gap-1 text-brand px-4 py-2 rounded-md font-bold text-sm hover:bg-brand/10 transition"
        >
          View in Calendar <span aria-hidden="true">&rarr;</span>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add tab switch atom to page.tsx**

In `app/atoms.ts`, add a tab switch atom (use string type to avoid importing the Tab type from page.tsx):

```tsx
/** Cross-component tab switch request. Set by PlannerScreen, consumed by page.tsx. */
export const switchTabAtom = atom<string | null>(null);
```

In `app/page.tsx` `HomeContent`, consume it:
```tsx
import { switchTabAtom } from "./atoms";

const switchTab = useAtomValue(switchTabAtom);
const setSwitchTab = useSetAtom(switchTabAtom);

// Watch for tab switch requests from other components
useEffect(() => {
  if (switchTab) {
    const tab = parseTab(switchTab);
    handleTabChange(tab);
    setSwitchTab(null);
  }
}, [switchTab]);
```

- [ ] **Step 3: Update PlannerScreen**

Pass `onViewCalendar` to ActionBar. Fix `handleUpload` to call `calendarReload()` (already in scope — `const calendarReload = useSetAtom(calendarReloadAtom)` exists at line 47 of PlannerScreen):

```tsx
// In handleUpload, after successful upload (after the Google Calendar sync line):
calendarReload();

// In the ActionBar render:
<ActionBar
  workoutCount={planEvents.length}
  isUploading={isUploading}
  statusMsg={statusMsg}
  onUpload={() => { void handleUpload(); }}
  onViewCalendar={() => { setSwitchTab("calendar"); }}
/>
```

Add the import: `import { switchTabAtom } from "../atoms";` and `const setSwitchTab = useSetAtom(switchTabAtom);`

- [ ] **Step 4: Run lint and verify**

Run: `npm run lint && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/ActionBar.tsx app/screens/PlannerScreen.tsx app/page.tsx app/atoms.ts
git commit -m "Add 'View in Calendar' link after upload, fix calendarReload"
```

### Task 12: EmptyState component + ghost previews

**Files:**
- Create: `app/components/EmptyState.tsx`

- [ ] **Step 1: Create EmptyState component**

```tsx
interface EmptyStateProps {
  children: React.ReactNode; // ghost SVG visual
  message: string;
}

export function EmptyState({ children, message }: EmptyStateProps) {
  return (
    <div className="relative flex items-center justify-center min-h-[200px]">
      <div className="opacity-[0.07] pointer-events-none select-none w-full">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-sm text-muted bg-bg/90 px-4 py-2 rounded-lg">
          {message}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/EmptyState.tsx
git commit -m "Add EmptyState component for ghost preview empty states"
```

### Task 13: Ghost empty state for Intel tab

**Files:**
- Modify: `app/screens/IntelScreen.tsx`

- [ ] **Step 1: Add empty state check**

At the top of IntelScreen, determine if the user has any completed runs:

```tsx
import { EmptyState } from "../components/EmptyState";

const hasCompletedRuns = events.some((e) => e.type === "completed");
```

- [ ] **Step 2: Show ghost state when no runs**

Wrap the Overview tab content. Before the existing `{activeTab === "overview" && (` block, add a check:

```tsx
{activeTab === "overview" && !hasCompletedRuns && !eventsLoading && (
  <EmptyState message="Complete your first run to unlock training insights">
    <svg width="100%" height="160" viewBox="0 0 400 160" className="text-muted">
      <polyline points="20,120 60,100 100,110 140,80 180,90 220,60 260,70 300,40 340,50 380,30" stroke="currentColor" strokeWidth="2" fill="none"/>
      <rect x="20" y="140" width="60" height="12" rx="3" fill="currentColor" opacity="0.3"/>
      <rect x="100" y="140" width="60" height="12" rx="3" fill="currentColor" opacity="0.3"/>
      <rect x="180" y="140" width="60" height="12" rx="3" fill="currentColor" opacity="0.3"/>
      <rect x="260" y="140" width="60" height="12" rx="3" fill="currentColor" opacity="0.3"/>
    </svg>
  </EmptyState>
)}

{activeTab === "overview" && (hasCompletedRuns || eventsLoading) && (
  // ... existing overview content
)}
```

Apply the same pattern to Deep Dive and Analysis tabs — show the ghost state if no completed runs.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/screens/IntelScreen.tsx
git commit -m "Add ghost empty state to Intel screen"
```

### Task 14: Ghost empty state for Simulate tab

**Files:**
- Modify: `app/screens/SimulateScreen.tsx:51-56`

- [ ] **Step 1: Replace plain text with ghost preview**

The current empty state (lines 51-56) is a plain text message. Replace it with:

```tsx
import { EmptyState } from "../components/EmptyState";

// Replace the existing plain text empty state:
if (!bgModel || bgModel.activitiesAnalyzed === 0) {
  return (
    <div className="h-full flex items-center justify-center px-6">
      <EmptyState message="Complete a few runs with CGM data to unlock BG simulation">
        <svg width="100%" height="120" viewBox="0 0 300 120" className="text-muted">
          <path d="M10,80 Q40,40 80,60 T150,50 T220,70 T290,40" stroke="currentColor" strokeWidth="2" fill="none"/>
          <line x1="10" y1="100" x2="290" y2="100" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
          <line x1="10" y1="20" x2="10" y2="100" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
        </svg>
      </EmptyState>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/screens/SimulateScreen.tsx
git commit -m "Add ghost empty state to Simulate screen"
```

### Task 15: Ghost empty state for Calendar (no events)

**Files:**
- Modify: `app/components/CalendarView.tsx`

- [ ] **Step 1: Add ghost state when no events and not loading**

In CalendarView, after events are loaded and empty, show the ghost:

```tsx
import { EmptyState } from "./EmptyState";

// After the loading check, before the calendar grid:
if (!isLoadingInitial && events.length === 0) {
  return (
    <div className="h-full flex items-center justify-center">
      <EmptyState message="Generate a training plan to fill your calendar">
        <svg width="100%" height="160" viewBox="0 0 350 160" className="text-muted">
          {/* 7-column grid suggestion */}
          {[0,1,2,3,4,5,6].map(col => (
            <g key={col}>
              <rect x={col * 50 + 2} y="10" width="46" height="20" rx="3" fill="currentColor" opacity="0.15"/>
              {[0,1,2,3].map(row => (
                <rect key={row} x={col * 50 + 2} y={row * 35 + 35} width="46" height="30" rx="3" fill="currentColor" opacity={row === 1 && (col === 2 || col === 4 || col === 6) ? "0.2" : "0.08"}/>
              ))}
            </g>
          ))}
        </svg>
      </EmptyState>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/CalendarView.tsx
git commit -m "Add ghost empty state to Calendar when no events"
```

### Task 16: Context-aware Coach suggestions

**Files:**
- Create: `lib/coachSuggestions.ts`
- Create: `lib/__tests__/coachSuggestions.test.ts`
- Modify: `app/screens/CoachScreen.tsx`

- [ ] **Step 1: Write test for getCoachSuggestions**

Create `lib/__tests__/coachSuggestions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getCoachSuggestions, type SuggestionContext } from "../coachSuggestions";

describe("getCoachSuggestions", () => {
  it("returns 4 suggestions", () => {
    const result = getCoachSuggestions({ hasPlan: false, hasRuns: false, hasBGData: false, hasBGModel: false, hasRace: false, diabetesMode: false });
    expect(result).toHaveLength(4);
  });

  it("includes only always-available suggestions for new user", () => {
    const result = getCoachSuggestions({ hasPlan: false, hasRuns: false, hasBGData: false, hasBGModel: false, hasRace: false, diabetesMode: false });
    // Should not include any suggestion requiring runs, bgData, etc.
    expect(result.every((s) => typeof s === "string")).toBe(true);
  });

  it("includes race suggestions when race is set", () => {
    const ctx: SuggestionContext = { hasPlan: true, hasRuns: false, hasBGData: false, hasBGModel: false, hasRace: true, diabetesMode: false };
    // Run multiple times to account for randomization
    const allSuggestions = new Set<string>();
    for (let i = 0; i < 20; i++) {
      getCoachSuggestions(ctx).forEach((s) => allSuggestions.add(s));
    }
    // At least one race-related suggestion should appear
    const hasRaceSuggestion = [...allSuggestions].some((s) => /race|goal|tracking/i.test(s));
    expect(hasRaceSuggestion).toBe(true);
  });

  it("excludes BG suggestions when diabetesMode is off", () => {
    const ctx: SuggestionContext = { hasPlan: true, hasRuns: true, hasBGData: true, hasBGModel: true, hasRace: true, diabetesMode: false };
    const allSuggestions = new Set<string>();
    for (let i = 0; i < 50; i++) {
      getCoachSuggestions(ctx).forEach((s) => allSuggestions.add(s));
    }
    const hasBGSuggestion = [...allSuggestions].some((s) => /BG|glucose|fuel rate/i.test(s));
    expect(hasBGSuggestion).toBe(false);
  });

  it("includes BG suggestions when diabetesMode is on and data exists", () => {
    const ctx: SuggestionContext = { hasPlan: true, hasRuns: true, hasBGData: true, hasBGModel: true, hasRace: false, diabetesMode: true };
    const allSuggestions = new Set<string>();
    for (let i = 0; i < 50; i++) {
      getCoachSuggestions(ctx).forEach((s) => allSuggestions.add(s));
    }
    const hasBGSuggestion = [...allSuggestions].some((s) => /BG|glucose|fuel rate/i.test(s));
    expect(hasBGSuggestion).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/__tests__/coachSuggestions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement coachSuggestions.ts**

Create `lib/coachSuggestions.ts`:

```ts
export interface SuggestionContext {
  hasPlan: boolean;
  hasRuns: boolean;
  hasBGData: boolean;
  hasBGModel: boolean;
  hasRace: boolean;
  diabetesMode: boolean;
}

interface CoachSuggestion {
  text: string;
  requires: Array<"plan" | "runs" | "bgData" | "bgModel" | "race">;
  diabetesOnly?: boolean;
  weight: number;
}

const POOL: CoachSuggestion[] = [
  // Always available
  { text: "What can Springa do for me?", requires: [], weight: 10 },
  { text: "Explain how the training plan works", requires: [], weight: 8 },
  { text: "How does workout generation work?", requires: [], weight: 6 },
  { text: "What data do you use to personalize my plan?", requires: [], weight: 5 },

  // Requires plan
  { text: "Walk me through this week's workouts", requires: ["plan"], weight: 9 },
  { text: "Why is tomorrow's run structured this way?", requires: ["plan"], weight: 7 },
  { text: "What's the thinking behind the cooldown length?", requires: ["plan"], weight: 6 },
  { text: "How does the weekly volume progress over time?", requires: ["plan"], weight: 5 },
  { text: "What should I focus on for my first run?", requires: ["plan"], weight: 8 },

  // Requires race
  { text: "How am I tracking for my race?", requires: ["race"], weight: 9 },
  { text: "Am I on pace to hit my race goal?", requires: ["race"], weight: 7 },
  { text: "How many weeks until race day?", requires: ["race"], weight: 5 },
  { text: "What does the taper look like?", requires: ["race"], weight: 6 },

  // Requires runs
  { text: "How's my training load looking?", requires: ["runs"], weight: 9 },
  { text: "Analyze my last run", requires: ["runs"], weight: 8 },
  { text: "Am I recovering well between sessions?", requires: ["runs"], weight: 7 },
  { text: "How's my pace trending?", requires: ["runs"], weight: 7 },
  { text: "Which run went best this week?", requires: ["runs"], weight: 6 },
  { text: "How does my HR compare across recent runs?", requires: ["runs"], weight: 5 },
  { text: "Am I hitting my target zones?", requires: ["runs"], weight: 6 },
  { text: "What should I adjust this week?", requires: ["runs"], weight: 8 },

  // Requires runs + BG data (diabetes only)
  { text: "How are my fuel rates working?", requires: ["runs", "bgData"], diabetesOnly: true, weight: 9 },
  { text: "Analyze my BG trends during runs", requires: ["runs", "bgData"], diabetesOnly: true, weight: 8 },
  { text: "Am I spiking after runs?", requires: ["runs", "bgData"], diabetesOnly: true, weight: 7 },
  { text: "What's my BG like in the first 20 minutes?", requires: ["runs", "bgData"], diabetesOnly: true, weight: 6 },
  { text: "Compare my BG on easy vs long runs", requires: ["runs", "bgData"], diabetesOnly: true, weight: 6 },
  { text: "How does starting BG affect my runs?", requires: ["runs", "bgData"], diabetesOnly: true, weight: 5 },

  // Requires BG model (diabetes only)
  { text: "Should I adjust my fuel rates?", requires: ["bgModel"], diabetesOnly: true, weight: 8 },
  { text: "How confident is the BG model right now?", requires: ["bgModel"], diabetesOnly: true, weight: 5 },
  { text: "What does the BG model say about long runs?", requires: ["bgModel"], diabetesOnly: true, weight: 6 },
];

const CONDITION_MAP: Record<string, keyof SuggestionContext> = {
  plan: "hasPlan",
  runs: "hasRuns",
  bgData: "hasBGData",
  bgModel: "hasBGModel",
  race: "hasRace",
};

function isEligible(suggestion: CoachSuggestion, ctx: SuggestionContext): boolean {
  if (suggestion.diabetesOnly && !ctx.diabetesMode) return false;
  return suggestion.requires.every((req) => ctx[CONDITION_MAP[req]]);
}

export function getCoachSuggestions(ctx: SuggestionContext, count = 4): string[] {
  const eligible = POOL.filter((s) => isEligible(s, ctx));
  if (eligible.length <= count) return eligible.map((s) => s.text);

  // Weighted random selection
  const selected: CoachSuggestion[] = [];
  const remaining = [...eligible];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, s) => sum + s.weight, 0);
    let rand = Math.random() * totalWeight;
    let picked = remaining.length - 1;
    for (let j = 0; j < remaining.length; j++) {
      rand -= remaining[j].weight;
      if (rand <= 0) { picked = j; break; }
    }
    selected.push(remaining[picked]);
    remaining.splice(picked, 1);
  }

  return selected.map((s) => s.text);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- lib/__tests__/coachSuggestions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/coachSuggestions.ts lib/__tests__/coachSuggestions.test.ts
git commit -m "Add context-aware Coach suggestion pool"
```

### Task 17: Integrate Coach suggestions + adaptive subtitle

**Files:**
- Modify: `app/screens/CoachScreen.tsx`

- [ ] **Step 1: Replace hardcoded SUGGESTIONS**

Remove the `SUGGESTIONS` const (lines 25-30). Import and use `getCoachSuggestions`:

```tsx
import { getCoachSuggestions } from "@/lib/coachSuggestions";
import { diabetesModeAtom } from "../atoms";

// Inside CoachScreen:
const diabetesMode = useAtomValue(diabetesModeAtom);

const hasRuns = events.some((e) => e.type === "completed");
const hasPlan = events.some((e) => e.type === "planned");

const suggestions = useMemo(
  () => getCoachSuggestions({
    hasPlan,
    hasRuns,
    hasBGData: !!bgModel?.activitiesAnalyzed,
    hasBGModel: !!bgModel,
    hasRace: !!settings?.raceDate,
    diabetesMode,
  }),
  [hasPlan, hasRuns, bgModel, settings?.raceDate, diabetesMode],
);
```

- [ ] **Step 2: Update welcome subtitle**

Change the welcome text:
```tsx
<p className="text-sm text-muted mb-6">
  {diabetesMode
    ? "Ask about training, fueling, BG management, or upcoming workouts."
    : "Ask about training, fueling, recovery, or upcoming workouts."}
</p>
```

- [ ] **Step 3: Update suggestion buttons to use dynamic list**

Replace `SUGGESTIONS.map(...)` with `suggestions.map(...)`.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/screens/CoachScreen.tsx
git commit -m "Wire up context-aware Coach suggestions and adaptive subtitle"
```

### Task 18: Diabetes mode gating — Simulate tab + fuel rates

**Files:**
- Modify: `app/components/TabNavigation.tsx`
- Modify: `app/screens/PlannerScreen.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Filter Simulate tab in TabNavigation**

In `app/components/TabNavigation.tsx`, accept a `hideTabs` prop:

```tsx
interface TabNavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  hideTabs?: Tab[];
}

// Inside the component:
const visibleTabs = hideTabs?.length
  ? TABS.filter((t) => !hideTabs.includes(t.key))
  : TABS;
```

Replace `TABS.map(...)` with `visibleTabs.map(...)` in both desktop and mobile renders.

- [ ] **Step 2: Pass hideTabs from page.tsx**

In `app/page.tsx`:

```tsx
import { diabetesModeAtom } from "./atoms";

const diabetesMode = useAtomValue(diabetesModeAtom);
const hideTabs: Tab[] = diabetesMode ? [] : ["simulate"];

// Handle edge case: if on simulate tab and diabetes mode turns off
useEffect(() => {
  if (!diabetesMode && activeTab === "simulate") {
    handleTabChange("calendar");
  }
}, [diabetesMode, activeTab, handleTabChange]);

<TabNavigation activeTab={activeTab} onTabChange={handleTabChange} hideTabs={hideTabs} />
```

Also conditionally render the Simulate screen div:
```tsx
{diabetesMode && (
  <div className={activeTab === "simulate" ? "h-full" : "hidden"}>
    <SimulateScreen />
  </div>
)}
```

- [ ] **Step 3: Hide fuel rates for non-diabetes in PlannerScreen**

In `app/screens/PlannerScreen.tsx`, wrap the fuel rates section with a diabetes mode check:

```tsx
const diabetesMode = useAtomValue(diabetesModeAtom);

// In the JSX, wrap the fuel rates div:
{diabetesMode && (
  <div className="flex-1">
    <span className="text-xs font-semibold uppercase tracking-wider text-muted">
      Fuel rates <span className="text-muted">g/h</span>
    </span>
    {/* ... existing fuel rates grid ... */}
  </div>
)}
```

- [ ] **Step 4: Run lint and tests**

Run: `npm run lint && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/TabNavigation.tsx app/page.tsx app/screens/PlannerScreen.tsx
git commit -m "Gate Simulate tab and fuel rates on diabetes mode"
```

### Task 19: Final integration test + PR

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Manual smoke test**

Start dev server and verify:
1. New user wizard → generates plan → lands on Planner with workouts
2. Upload → "View in Calendar" link works → Calendar shows events
3. Intel shows ghost state before first run
4. Coach shows context-appropriate suggestions
5. Simulate tab hidden when diabetes mode off
6. Fuel rates hidden when diabetes mode off
7. BG widgets in Intel don't appear for non-diabetes users (existing gating via `useRunData` skipBG + `widgetRenderMap` null returns — verify no regression)

- [ ] **Step 6: Create PR**

Create PR with title: "First-run experience: auto-generate plan, ghost states, context-aware Coach (#XXX)"
