# GoalStep Wizard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the GoalStep wizard to collect distance + experience level + goal time + target date, replacing the old "have a race / just running" toggle. Connect goal time to the pace-based workout generator.

**Architecture:** GoalStep becomes a progressive-disclosure form (distance → experience → time slider → date). New `getDefaultGoalTime()` and `getSliderRange()` functions in `lib/paceTable.ts` supply defaults. `getPaceTable()` (already exists) provides live pace preview. Page.tsx passes `goalTime` through to `generatePlan()`.

**Tech Stack:** TypeScript, React, Next.js App Router, Vitest, Tailwind CSS

**Spec:** `docs/specs/2026-04-08-goal-step-redesign.md`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `lib/paceTable.ts` | Add experience defaults + slider range helpers | Modify |
| `lib/__tests__/paceTable.test.ts` | Tests for new helper functions | Modify |
| `app/setup/GoalStep.tsx` | Complete rewrite — distance/experience/time/date | Rewrite |
| `app/setup/page.tsx` | Wire goalTime through wizard data + generatePlan | Modify |
| `app/api/settings/route.ts` | Add goalTime to allowed fields | Modify |
| `app/components/PlannerConfigPanel.tsx` | Add goal time slider to planner config | Modify |

---

### Task 1: Add experience defaults and slider range to paceTable.ts

**Files:**
- Modify: `lib/paceTable.ts`
- Modify: `lib/__tests__/paceTable.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `lib/__tests__/paceTable.test.ts`:

```typescript
import { getDefaultGoalTime, getSliderRange } from "../paceTable";

describe("getDefaultGoalTime", () => {
  it("returns beginner HM default", () => {
    expect(getDefaultGoalTime(21.0975, "beginner")).toBe(9000); // 2:30
  });

  it("returns intermediate HM default", () => {
    expect(getDefaultGoalTime(21.0975, "intermediate")).toBe(7500); // 2:05
  });

  it("returns experienced HM default", () => {
    expect(getDefaultGoalTime(21.0975, "experienced")).toBe(6300); // 1:45
  });

  it("returns intermediate 5K default", () => {
    expect(getDefaultGoalTime(5, "intermediate")).toBe(1620); // 27:00
  });

  it("returns intermediate 10K default", () => {
    expect(getDefaultGoalTime(10, "intermediate")).toBe(3360); // 56:00
  });

  it("returns intermediate marathon default", () => {
    expect(getDefaultGoalTime(42.195, "intermediate")).toBe(15300); // 4:15
  });

  it("interpolates for custom distances", () => {
    const time = getDefaultGoalTime(16, "intermediate");
    // Between 10K (56:00 = 3360s) and HM (2:05 = 7500s)
    // 16km: 3360 + (7500 - 3360) * (16 - 10) / (21.0975 - 10) = 5598
    expect(time).toBeGreaterThan(3360);
    expect(time).toBeLessThan(7500);
  });
});

describe("getSliderRange", () => {
  it("returns 5K range", () => {
    const range = getSliderRange(5);
    expect(range).toEqual({ min: 900, max: 2700, step: 60 }); // 15:00 - 45:00, 1min step
  });

  it("returns HM range", () => {
    const range = getSliderRange(21.0975);
    expect(range).toEqual({ min: 4800, max: 11700, step: 300 }); // 1:20 - 3:15, 5min step
  });

  it("returns marathon range", () => {
    const range = getSliderRange(42.195);
    expect(range).toEqual({ min: 9900, max: 23400, step: 300 }); // 2:45 - 6:30, 5min step
  });

  it("uses nearest standard range for custom distances", () => {
    const range = getSliderRange(16);
    // 16km falls in the 11-22km bucket (HM range)
    expect(range).toEqual({ min: 4800, max: 11700, step: 300 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/paceTable.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement the helper functions**

Add to `lib/paceTable.ts`:

```typescript
export type ExperienceLevel = "beginner" | "intermediate" | "experienced";

/** Standard distances with defaults per experience level (seconds). */
const STANDARD_DISTANCES: { km: number; defaults: Record<ExperienceLevel, number> }[] = [
  { km: 5, defaults: { beginner: 2100, intermediate: 1620, experienced: 1320 } },   // 35:00, 27:00, 22:00
  { km: 10, defaults: { beginner: 4320, intermediate: 3360, experienced: 2760 } },  // 1:12, 56:00, 46:00
  { km: 21.0975, defaults: { beginner: 9000, intermediate: 7500, experienced: 6300 } }, // 2:30, 2:05, 1:45
  { km: 42.195, defaults: { beginner: 18900, intermediate: 15300, experienced: 12600 } }, // 5:15, 4:15, 3:30
];

/** Standard distance buttons for the wizard UI. */
export const DISTANCE_OPTIONS = [
  { label: "5K", km: 5 },
  { label: "10K", km: 10 },
  { label: "Half", km: 21.0975 },
  { label: "Marathon", km: 42.195 },
] as const;

/** Get default goal time for a distance and experience level.
 *  Interpolates linearly for non-standard distances. */
export function getDefaultGoalTime(distanceKm: number, level: ExperienceLevel): number {
  // Exact match
  const exact = STANDARD_DISTANCES.find((d) => Math.abs(d.km - distanceKm) < 0.5);
  if (exact) return exact.defaults[level];

  // Interpolate between nearest standard distances
  let lower = STANDARD_DISTANCES[0];
  let upper = STANDARD_DISTANCES[STANDARD_DISTANCES.length - 1];
  for (let i = 0; i < STANDARD_DISTANCES.length - 1; i++) {
    if (distanceKm >= STANDARD_DISTANCES[i].km && distanceKm <= STANDARD_DISTANCES[i + 1].km) {
      lower = STANDARD_DISTANCES[i];
      upper = STANDARD_DISTANCES[i + 1];
      break;
    }
  }

  const fraction = (distanceKm - lower.km) / (upper.km - lower.km);
  return Math.round(lower.defaults[level] + (upper.defaults[level] - lower.defaults[level]) * fraction);
}

/** Slider range for a given distance. Returns min/max in seconds and step size. */
export function getSliderRange(distanceKm: number): { min: number; max: number; step: number } {
  // Standard ranges
  const ranges: { maxKm: number; min: number; max: number; step: number }[] = [
    { maxKm: 5.5, min: 900, max: 2700, step: 60 },       // 5K: 15:00 - 45:00, 1min
    { maxKm: 11, min: 2100, max: 5400, step: 60 },        // 10K: 35:00 - 1:30:00, 1min
    { maxKm: 22, min: 4800, max: 11700, step: 300 },      // HM: 1:20 - 3:15, 5min
    { maxKm: 50, min: 9900, max: 23400, step: 300 },      // Marathon: 2:45 - 6:30, 5min
  ];

  for (const r of ranges) {
    if (distanceKm <= r.maxKm) return { min: r.min, max: r.max, step: r.step };
  }
  return ranges[ranges.length - 1]; // default to marathon range
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/paceTable.test.ts`
Expected: PASS

- [ ] **Step 5: Run lint and commit**

Run: `npm run lint`
Commit: `feat: add experience defaults and slider range helpers to paceTable`

---

### Task 2: Rewrite GoalStep.tsx

**Files:**
- Rewrite: `app/setup/GoalStep.tsx`

This is a complete rewrite. The new component has progressive disclosure: distance → experience → time slider → date.

- [ ] **Step 1: Read the existing GoalStep.tsx and the mockup reference**

Read `app/setup/GoalStep.tsx` (current code). Reference the visual mockup from brainstorming: the component has 4 sections that appear progressively.

- [ ] **Step 2: Write the new GoalStep**

The component must:
- Accept props: `{ raceDate?: string; raceDist?: number; goalTime?: number; onNext: (data: { raceDist: number; goalTime: number; raceDate: string }) => void; onBack: () => void }`
- No `onSkip` — distance is required
- Progressive disclosure: sections 2-4 appear as previous sections are filled
- Distance: 4 buttons (5K/10K/Half/Marathon) + "Other distance" → km input
- Experience: 3 buttons (Beginner/Intermediate/Experienced) with descriptions
- Time: range input, large display, live pace preview using `getPaceTable` + `formatPace`
- Date: date input, defaults to 16 weeks from today, shows week count
- Save to backend on Next (PUT /api/settings with raceDist, goalTime, raceDate)

Key imports:
```typescript
import { getPaceTable, getDefaultGoalTime, getSliderRange, DISTANCE_OPTIONS, type ExperienceLevel } from "@/lib/paceTable";
import { formatPace } from "@/lib/format";
import { addWeeks, format, differenceInWeeks, parseISO } from "date-fns";
```

Use the project's existing Tailwind classes: `bg-surface`, `border-border`, `text-text`, `text-muted`, `bg-brand`, `text-brand`, `bg-surface-alt`, etc. Follow the style of existing wizard steps (HRZonesStep, ScheduleStep).

The slider is a native `<input type="range">` — don't build a custom slider component. Style it with Tailwind's `accent-brand` class.

The pace preview box uses `getPaceTable(selectedDist, sliderValue)` and `formatPace()` to show:
```
Easy       7:03 – 7:46 /km
Race       6:29 – 6:41 /km
Intervals  6:00 – 6:13 /km
```

Format the large time display: for times >= 1 hour show "H:MM", for times < 1 hour show "MM:SS". Add a `formatGoalTime(secs: number): string` function to `lib/format.ts` (alongside existing `formatPace` and `formatDuration`) — both GoalStep and PlannerConfigPanel need it. Import from there.

- [ ] **Step 3: Verify it renders without errors**

Run: `npm run build`
Expected: No TypeScript errors. The component isn't connected yet (page.tsx still uses old props).

- [ ] **Step 4: Commit**

Commit: `feat: rewrite GoalStep — distance, experience, time slider, date picker`

---

### Task 3: Wire GoalStep into wizard page + API route

**Files:**
- Modify: `app/setup/page.tsx`
- Modify: `app/api/settings/route.ts`

- [ ] **Step 1: Read both files**

Read `app/setup/page.tsx` and `app/api/settings/route.ts`.

- [ ] **Step 2: Update WizardData in page.tsx**

Change `raceDist?: number` to `raceDist: number` (required). Add `goalTime?: number`. Remove `raceName` from WizardData (no longer collected in wizard — it still exists in `UserSettings` and `PlannerConfigPanel`, just not in the wizard flow).

```typescript
interface WizardData {
  // ... existing fields ...
  raceDist: number;       // was optional, now required
  goalTime?: number;      // new
  // raceName removed — lives only in PlannerConfigPanel
}
```

Update initial state:
```typescript
const [data, setData] = useState<WizardData>({
  displayName: "",
  timezone: "Europe/Stockholm",
  intervalsApiKey: "",
  runDays: [],
  raceDist: 21.0975,  // default to HM
  diabetesMode: false,
});
```

- [ ] **Step 3: Update GoalStep usage in page.tsx**

Replace the GoalStep rendering (currently step 5):

```typescript
{step === 5 && (
  <GoalStep
    raceDate={data.raceDate}
    raceDist={data.raceDist}
    goalTime={data.goalTime}
    onNext={(goal) => {
      updateData(goal);
      setStep(6);
    }}
    onBack={() => { setStep(4); }}
  />
)}
```

No `onSkip` prop — distance is required.

- [ ] **Step 4: Pass goalTime to generatePlan in handleComplete**

In `handleComplete`, add `data.goalTime` as the last argument:

```typescript
const events = generatePlan(
  null,
  raceDate,
  data.raceDist,
  totalWeeks,
  8,
  data.lthr ?? DEFAULT_LTHR,
  hrZones,
  false,
  data.diabetesMode,
  {
    runDays: data.runDays,
    longRunDay: data.longRunDay ?? 0,
    clubDay: data.clubDay,
    clubType: data.clubType,
  },
  data.goalTime,  // ← pass through
);
```

Also remove the `data.raceDist ?? 16` fallback — raceDist is always set now.

- [ ] **Step 5: Add goalTime to settings API route whitelist**

In `app/api/settings/route.ts`, find the allowed fields section (~line 102-104) and add:

```typescript
if (body.goalTime !== undefined) allowed.goalTime = body.goalTime;
```

- [ ] **Step 6: Build check**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 7: Commit**

Commit: `feat: wire GoalStep into wizard — goalTime flows to plan generation`

---

### Task 4: Add goal time to PlannerConfigPanel

**Files:**
- Modify: `app/components/PlannerConfigPanel.tsx`

- [ ] **Step 1: Read PlannerConfigPanel.tsx fully**

Read the entire file. Understand the existing pattern: state variables, `saveField()`, `handleRaceBlur()`, and the JSX layout.

- [ ] **Step 2: Add goalTime state and save logic**

Add state:
```typescript
const [goalTime, setGoalTime] = useState<number | undefined>(settings.goalTime);
```

Add to `handleRaceBlur()` (or create a separate blur handler):
```typescript
if (goalTime !== settings.goalTime) updates.goalTime = goalTime;
```

- [ ] **Step 3: Add goal time slider to the race goal section**

After the existing race date field, add:

```tsx
{/* Goal Time */}
{raceDist && (
  <div>
    <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
      Current Ability
    </div>
    {goalTime && (
      <div className="text-center text-2xl font-bold text-brand mb-2">
        {formatGoalTime(goalTime)}
      </div>
    )}
    <input
      type="range"
      min={getSliderRange(typeof raceDist === "number" ? raceDist : 21.0975).min}
      max={getSliderRange(typeof raceDist === "number" ? raceDist : 21.0975).max}
      step={getSliderRange(typeof raceDist === "number" ? raceDist : 21.0975).step}
      value={goalTime ?? getDefaultGoalTime(typeof raceDist === "number" ? raceDist : 21.0975, "intermediate")}
      onChange={(e) => { setGoalTime(Number(e.target.value)); }}
      onMouseUp={handleRaceBlur}
      onTouchEnd={handleRaceBlur}
      className="w-full accent-brand"
    />
  </div>
)}
```

Import `formatGoalTime` from `@/lib/format` (added in Task 2), `getSliderRange` and `getDefaultGoalTime` from `@/lib/paceTable`.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

Commit: `feat: add goal time slider to PlannerConfigPanel`

---

### Task 5: Full test suite + lint + build

**Files:** Various

- [ ] **Step 1: Run full test suite**

Run: `npm test`

- [ ] **Step 2: Fix any failures**

Common issues:
- Tests that pass `onSkip` to GoalStep — remove the prop
- Tests that check for "Just running" button — update or remove
- Settings tests that need goalTime in fixtures

- [ ] **Step 3: Run lint**

Run: `npm run lint`

- [ ] **Step 4: Build**

Run: `npm run build`

- [ ] **Step 5: Commit fixes if any**

Commit: `fix: update tests for GoalStep redesign`

---

## Self-Review Checklist

**Spec coverage:**
- [x] Distance picker with 4 standard + Other (Task 2)
- [x] Experience level selector (Task 2)
- [x] Time slider with live pace preview (Task 2)
- [x] Target date with 16-week default (Task 2)
- [x] No "Just running" / no `onSkip` (Tasks 2, 3)
- [x] No race name in wizard (Task 3)
- [x] goalTime flows to generatePlan (Task 3)
- [x] API route whitelist updated (Task 3)
- [x] PlannerConfigPanel gets goal time (Task 4)
- [x] Experience defaults from research (Task 1)
- [x] Custom distance interpolation (Task 1)

**Type consistency:** `ExperienceLevel` defined in Task 1, used in Task 2. `DISTANCE_OPTIONS` exported in Task 1, used in Task 2. `getDefaultGoalTime` / `getSliderRange` defined in Task 1, used in Tasks 2 and 4. `GoalStep` props change in Task 2, caller updated in Task 3.

**Note:** Task 2 (GoalStep rewrite) is a large UI task. The plan provides the structure, imports, and key logic, but the exact Tailwind class composition should follow existing wizard step patterns (HRZonesStep, ScheduleStep). The implementing agent should read those files for reference.
