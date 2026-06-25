# Start New Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a returning runner start a fresh training program after completing a race, with guided inputs, local preview, and an explicit replace-future-workouts confirmation.

**Architecture:** Keep account onboarding in `/setup`; add a returning-runner program flow inside Planner. Draft program settings live in React state until the user confirms, then Planner saves settings, pushes threshold pace if needed, uploads generated workouts through the existing bulk Intervals.icu path, syncs Google Calendar, and reloads calendar data. A small pure helper module owns completion detection, draft defaults, validation, week calculation, and config-key serialization so UI tests stay focused.

**Tech Stack:** Next.js App Router, TypeScript, React 19, Jotai, date-fns, Vitest, React Testing Library, MSW, Intervals.icu proxy routes.

**Product Context:** EcoTrail 16km was the previous target race on `2026-06-13`. The current date for this plan is `2026-06-24`, so the existing `raceDate` is in the past. New-user setup is already handled by `app/setup/page.tsx`; returning users should not see Intervals.icu, watch, or diabetes setup again.

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `lib/programs.ts` | Pure helpers for program completion, draft defaults, validation, plan week calculation, and config key serialization. |
| `lib/__tests__/programs.test.ts` | Unit tests for all helper behavior, including past-race detection and too-soon validation. |
| `app/components/NewProgramWizard.tsx` | Returning-runner program setup form: race goal, current fitness, schedule, plan options, preview action, cancellation. |
| `app/components/__tests__/NewProgramWizard.integration.test.tsx` | Interaction tests for the wizard form and validation messaging. |

### Modified Files

| File | Change |
|---|---|
| `app/screens/PlannerScreen.tsx` | Add Start New Program entry points, draft state, preview generation, final confirmation/upload flow, and completion banner. |
| `app/components/ActionBar.tsx` | Add optional label/copy props so the same upload bar can say "Start Program" for replacement confirmation while preserving existing defaults. |
| `app/components/__tests__/PlannerScreen.integration.test.tsx` | Add tests for completed-program banner, preview-without-write, and confirm-save-upload behavior. |

### No Schema Changes

The existing `user_settings` fields already cover this feature:

- `race_date`
- `race_name`
- `race_dist`
- `current_ability_secs`
- `current_ability_dist`
- `total_weeks`
- `start_km`
- `include_base_phase`
- `run_days`
- `long_run_day`
- `club_day`
- `club_type`

Do not add a `programs` table in this implementation. Historical program analysis can be derived from completed activities and old settings/race metadata later.

---

## Behavioral Requirements

1. A completed-program banner appears when `settings.raceDate` is before today and there are no future planned workouts.
2. Planner always exposes a secondary `Start New Program` action when settings are loaded.
3. The flow is local-draft first. Editing new program values must not call `/api/settings`, `/api/intervals/events/bulk`, `/api/intervals/threshold-pace`, or Google Calendar sync.
4. Preview validates the draft, generates future workouts with `generatePlan()`, and shows the normal weekly chart and workout list.
5. Final confirmation explicitly says future Springa-generated workouts will be replaced, while completed runs and other calendar items remain.
6. Final confirmation saves settings first, pushes threshold pace when ability changed, uploads workouts through `uploadPlan()`, syncs Google Calendar best-effort, reloads calendar data, stores a fresh generated config key, and switches the primary UI back to the active plan state.
7. Existing Planner generate/upload behavior keeps working unchanged.

---

## Task 1: Add Pure Program Helpers

**Files:**
- Create: `lib/programs.ts`
- Test: `lib/__tests__/programs.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `lib/__tests__/programs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/types";
import type { UserSettings } from "@/lib/settings";
import {
  buildDefaultNewProgramDraft,
  buildProgramConfigKey,
  getProgramWeeks,
  isProgramFinished,
  validateNewProgramDraft,
} from "../programs";

function plannedEvent(date: string): CalendarEvent {
  return {
    id: `event-${date}`,
    date: new Date(`${date}T12:00:00`),
    name: "W01 Easy",
    description: "Easy run",
    type: "planned",
    category: "easy",
  };
}

const now = new Date("2026-06-24T10:00:00");

describe("isProgramFinished", () => {
  it("returns true when race date is past and no future planned workouts remain", () => {
    const settings: UserSettings = { raceDate: "2026-06-13" };

    expect(isProgramFinished(settings, [], now)).toBe(true);
  });

  it("returns false when the race date is today or in the future", () => {
    expect(isProgramFinished({ raceDate: "2026-06-24" }, [], now)).toBe(false);
    expect(isProgramFinished({ raceDate: "2026-07-01" }, [], now)).toBe(false);
  });

  it("returns false when future planned workouts still exist", () => {
    const settings: UserSettings = { raceDate: "2026-06-13" };

    expect(isProgramFinished(settings, [plannedEvent("2026-06-25")], now)).toBe(false);
  });
});

describe("getProgramWeeks", () => {
  it("counts calendar weeks until the race with a 12 week minimum", () => {
    expect(getProgramWeeks("2026-08-01", now)).toBe(12);
    expect(getProgramWeeks("2026-11-01", now)).toBeGreaterThan(12);
  });
});

describe("buildDefaultNewProgramDraft", () => {
  it("prefills from settings and moves the race date into the future", () => {
    const draft = buildDefaultNewProgramDraft({
      raceName: "EcoTrail",
      raceDist: 16,
      raceDate: "2026-06-13",
      currentAbilityDist: 10,
      currentAbilitySecs: 3300,
      runDays: [2, 4, 0],
      longRunDay: 0,
      totalWeeks: 18,
      startKm: 8,
      includeBasePhase: false,
    }, now);

    expect(draft.raceName).toBe("");
    expect(draft.raceDist).toBe(16);
    expect(draft.raceDate).toBe("2026-10-28");
    expect(draft.currentAbilityDist).toBe(10);
    expect(draft.currentAbilitySecs).toBe(3300);
    expect(draft.runDays).toEqual([2, 4, 0]);
    expect(draft.longRunDay).toBe(0);
    expect(draft.totalWeeks).toBe(18);
    expect(draft.startKm).toBe(8);
  });
});

describe("validateNewProgramDraft", () => {
  const validDraft = buildDefaultNewProgramDraft({
    raceDist: 16,
    currentAbilityDist: 10,
    currentAbilitySecs: 3300,
    runDays: [2, 4, 0],
    longRunDay: 0,
    totalWeeks: 18,
    startKm: 8,
  }, now);

  it("accepts a complete valid draft", () => {
    expect(validateNewProgramDraft(validDraft, now)).toBeNull();
  });

  it("rejects too-soon race dates", () => {
    expect(validateNewProgramDraft({ ...validDraft, raceDate: "2026-08-01" }, now)).toBe(
      "Race date must be at least 12 weeks away.",
    );
  });

  it("rejects schedules without a long run day", () => {
    expect(validateNewProgramDraft({ ...validDraft, longRunDay: undefined }, now)).toBe(
      "Pick a long run day.",
    );
  });

  it("rejects schedules with fewer than two run days", () => {
    expect(validateNewProgramDraft({ ...validDraft, runDays: [0] }, now)).toBe(
      "Pick at least two run days.",
    );
  });
});

describe("buildProgramConfigKey", () => {
  it("serializes all fields that affect generated workouts", () => {
    const key = buildProgramConfigKey({
      raceName: "Stockholm Half",
      raceDist: 21.0975,
      raceDate: "2026-10-28",
      currentAbilityDist: 10,
      currentAbilitySecs: 3300,
      runDays: [2, 4, 0],
      longRunDay: 0,
      clubDay: 4,
      clubType: "speed",
      totalWeeks: 18,
      startKm: 8,
      includeBasePhase: true,
    });

    expect(JSON.parse(key)).toEqual({
      raceName: "Stockholm Half",
      raceDist: 21.0975,
      raceDate: "2026-10-28",
      currentAbilityDist: 10,
      currentAbilitySecs: 3300,
      runDays: [0, 2, 4],
      longRunDay: 0,
      clubDay: 4,
      clubType: "speed",
      totalWeeks: 18,
      startKm: 8,
      includeBasePhase: true,
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- lib/__tests__/programs.test.ts
```

Expected: FAIL with an import error for `../programs`.

- [ ] **Step 3: Create helper implementation**

Create `lib/programs.ts`:

```ts
import { addWeeks, differenceInWeeks, format, isBefore, parseISO, startOfDay } from "date-fns";
import type { UserSettings } from "./settings";
import type { CalendarEvent } from "./types";

export interface NewProgramDraft {
  raceName: string;
  raceDist: number;
  raceDate: string;
  currentAbilityDist: number;
  currentAbilitySecs: number;
  runDays: number[];
  longRunDay?: number;
  clubDay?: number;
  clubType?: string;
  totalWeeks: number;
  startKm: number;
  includeBasePhase: boolean;
}

export const MIN_NEW_PROGRAM_WEEKS = 12;

function sortDays(days: number[]): number[] {
  return [...days].sort((a, b) => a - b);
}

export function isProgramFinished(
  settings: Pick<UserSettings, "raceDate"> | null | undefined,
  events: CalendarEvent[],
  now = new Date(),
): boolean {
  if (!settings?.raceDate) return false;

  const today = startOfDay(now);
  const raceDate = startOfDay(parseISO(settings.raceDate));
  if (!isBefore(raceDate, today)) return false;

  return !events.some((event) => event.type === "planned" && event.date >= today);
}

export function getProgramWeeks(raceDate: string, now = new Date()): number {
  return Math.max(MIN_NEW_PROGRAM_WEEKS, differenceInWeeks(parseISO(raceDate), now));
}

export function buildDefaultNewProgramDraft(
  settings: UserSettings,
  now = new Date(),
): NewProgramDraft {
  const totalWeeks = Math.max(MIN_NEW_PROGRAM_WEEKS, settings.totalWeeks ?? 18);
  const runDays = settings.runDays?.length ? settings.runDays : [2, 4, 6, 0];
  const fallbackLongRunDay = runDays.includes(settings.longRunDay ?? -1)
    ? settings.longRunDay
    : runDays.includes(0)
      ? 0
      : runDays[runDays.length - 1];

  return {
    raceName: "",
    raceDist: settings.raceDist ?? 16,
    raceDate: format(addWeeks(now, totalWeeks), "yyyy-MM-dd"),
    currentAbilityDist: settings.currentAbilityDist ?? settings.raceDist ?? 10,
    currentAbilitySecs: settings.currentAbilitySecs ?? 0,
    runDays,
    longRunDay: fallbackLongRunDay,
    clubDay: settings.clubDay,
    clubType: settings.clubType,
    totalWeeks,
    startKm: settings.startKm ?? 8,
    includeBasePhase: settings.includeBasePhase ?? false,
  };
}

export function validateNewProgramDraft(
  draft: NewProgramDraft,
  now = new Date(),
): string | null {
  if (!draft.raceDist || draft.raceDist < 1 || draft.raceDist > 100) {
    return "Race distance must be between 1 and 100 km.";
  }
  if (!draft.raceDate) {
    return "Pick a race date.";
  }
  if (getProgramWeeks(draft.raceDate, now) < MIN_NEW_PROGRAM_WEEKS) {
    return `Race date must be at least ${MIN_NEW_PROGRAM_WEEKS} weeks away.`;
  }
  if (!draft.currentAbilityDist || draft.currentAbilityDist <= 0) {
    return "Pick your current fitness distance.";
  }
  if (!draft.currentAbilitySecs || draft.currentAbilitySecs <= 0) {
    return "Set your current fitness time.";
  }
  if (draft.runDays.length < 2) {
    return "Pick at least two run days.";
  }
  if (draft.longRunDay == null) {
    return "Pick a long run day.";
  }
  if (!draft.runDays.includes(draft.longRunDay)) {
    return "Long run day must be one of your run days.";
  }
  if (draft.clubDay != null && !draft.runDays.includes(draft.clubDay)) {
    return "Club run day must be one of your run days.";
  }
  if (!draft.totalWeeks || draft.totalWeeks < MIN_NEW_PROGRAM_WEEKS) {
    return `Plan length must be at least ${MIN_NEW_PROGRAM_WEEKS} weeks.`;
  }
  if (!draft.startKm || draft.startKm < 2 || draft.startKm > 30) {
    return "Start distance must be between 2 and 30 km.";
  }

  return null;
}

export function buildProgramConfigKey(draft: NewProgramDraft): string {
  return JSON.stringify({
    raceName: draft.raceName.trim(),
    raceDist: draft.raceDist,
    raceDate: draft.raceDate,
    currentAbilityDist: draft.currentAbilityDist,
    currentAbilitySecs: draft.currentAbilitySecs,
    runDays: sortDays(draft.runDays),
    longRunDay: draft.longRunDay,
    clubDay: draft.clubDay,
    clubType: draft.clubType,
    totalWeeks: draft.totalWeeks,
    startKm: draft.startKm,
    includeBasePhase: draft.includeBasePhase,
  });
}

export function toSettingsUpdate(draft: NewProgramDraft): Partial<UserSettings> {
  return {
    raceName: draft.raceName.trim() || undefined,
    raceDist: draft.raceDist,
    raceDate: draft.raceDate,
    currentAbilityDist: draft.currentAbilityDist,
    currentAbilitySecs: draft.currentAbilitySecs,
    runDays: sortDays(draft.runDays),
    longRunDay: draft.longRunDay,
    clubDay: draft.clubDay,
    clubType: draft.clubType,
    totalWeeks: draft.totalWeeks,
    startKm: draft.startKm,
    includeBasePhase: draft.includeBasePhase,
  };
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
npm test -- lib/__tests__/programs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/programs.ts lib/__tests__/programs.test.ts
git commit -m "feat: add new program lifecycle helpers"
```

---

## Task 2: Make ActionBar Copy Configurable

**Files:**
- Modify: `app/components/ActionBar.tsx`
- Test: Existing Planner tests should still pass with defaults.

- [ ] **Step 1: Update props and defaults**

Modify `ActionBarProps` in `app/components/ActionBar.tsx`:

```ts
interface ActionBarProps {
  workoutCount: number;
  isUploading: boolean;
  statusMsg: string;
  onUpload: () => void;
  onViewCalendar?: () => void;
  readyTitle?: string;
  readyDescription?: string;
  actionLabel?: string;
  uploadingTitle?: string;
  uploadingDescription?: string;
  completeTitle?: string;
}
```

Change the function signature:

```ts
export function ActionBar({
  workoutCount,
  isUploading,
  statusMsg,
  onUpload,
  onViewCalendar,
  readyTitle = "Ready to sync?",
  readyDescription = `${workoutCount} workouts generated.`,
  actionLabel = "Sync",
  uploadingTitle = "Syncing...",
  uploadingDescription = `${workoutCount} workouts uploading`,
  completeTitle = "Upload complete",
}: ActionBarProps) {
```

- [ ] **Step 2: Replace hardcoded strings**

In the uploading branch:

```tsx
<h3 className="font-bold text-text text-sm md:text-base">
  {uploadingTitle}
</h3>
<p className="text-sm text-muted">
  {uploadingDescription}
</p>
```

In the success branch:

```tsx
<h3 className="font-bold text-success text-sm md:text-base">
  {completeTitle}
</h3>
```

In the ready branch:

```tsx
<h3 className="font-bold text-text text-sm md:text-base">
  {readyTitle}
</h3>
<p className="text-sm text-muted">
  {readyDescription}
</p>
```

And the ready button text:

```tsx
<UploadCloud size={18} /> {actionLabel}
```

The retry button remains `Retry`; it is not a start-program action.

- [ ] **Step 3: Run existing Planner tests**

Run:

```bash
npm test -- app/components/__tests__/PlannerScreen.integration.test.tsx
```

Expected: PASS. Existing tests look for default `Sync` text, so they should not need changes.

- [ ] **Step 4: Commit**

```bash
git add app/components/ActionBar.tsx
git commit -m "refactor: allow planner action bar copy overrides"
```

---

## Task 3: Add New Program Wizard Component

**Files:**
- Create: `app/components/NewProgramWizard.tsx`
- Test: `app/components/__tests__/NewProgramWizard.integration.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `app/components/__tests__/NewProgramWizard.integration.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { NewProgramWizard } from "../NewProgramWizard";
import type { NewProgramDraft } from "@/lib/programs";
import "@/lib/__tests__/setup-dom";

const initialDraft: NewProgramDraft = {
  raceName: "",
  raceDist: 16,
  raceDate: "2026-10-28",
  currentAbilityDist: 10,
  currentAbilitySecs: 3300,
  runDays: [2, 4, 0],
  longRunDay: 0,
  totalWeeks: 18,
  startKm: 8,
  includeBasePhase: false,
};

describe("NewProgramWizard", () => {
  it("renders returning-runner sections with prefilled values", () => {
    render(
      <NewProgramWizard
        draft={initialDraft}
        validationError={null}
        onDraftChange={() => {}}
        onCancel={() => {}}
        onPreview={() => {}}
      />,
    );

    expect(screen.getByText("Start new program")).toBeInTheDocument();
    expect(screen.getByText("Race goal")).toBeInTheDocument();
    expect(screen.getByText("Current fitness")).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByDisplayValue("16")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-10-28")).toBeInTheDocument();
  });

  it("updates race name and calls preview with the changed draft", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const onPreview = vi.fn();

    render(
      <NewProgramWizard
        draft={initialDraft}
        validationError={null}
        onDraftChange={onDraftChange}
        onCancel={() => {}}
        onPreview={onPreview}
      />,
    );

    await user.type(screen.getByLabelText("Race name"), "Stockholm Half");
    expect(onDraftChange).toHaveBeenLastCalledWith({
      ...initialDraft,
      raceName: "Stockholm Half",
    });

    await user.click(screen.getByRole("button", { name: "Preview plan" }));
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("shows validation errors from Planner", () => {
    render(
      <NewProgramWizard
        draft={initialDraft}
        validationError="Race date must be at least 12 weeks away."
        onDraftChange={() => {}}
        onCancel={() => {}}
        onPreview={() => {}}
      />,
    );

    expect(screen.getByText("Race date must be at least 12 weeks away.")).toBeInTheDocument();
  });

  it("does not allow removing the final run day", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const oneDayDraft: NewProgramDraft = {
      ...initialDraft,
      runDays: [0],
      longRunDay: 0,
    };

    render(
      <NewProgramWizard
        draft={oneDayDraft}
        validationError={null}
        onDraftChange={onDraftChange}
        onCancel={() => {}}
        onPreview={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sun" }));
    expect(onDraftChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the failing component tests**

Run:

```bash
npm test -- app/components/__tests__/NewProgramWizard.integration.test.tsx
```

Expected: FAIL with an import error for `../NewProgramWizard`.

- [ ] **Step 3: Create the component**

Create `app/components/NewProgramWizard.tsx`:

```tsx
"use client";

import type { NewProgramDraft } from "@/lib/programs";
import { DISTANCE_OPTIONS, getDefaultGoalTime, getSliderRange } from "@/lib/paceTable";
import { formatGoalTime } from "@/lib/format";
import { MIN_NEW_PROGRAM_WEEKS } from "@/lib/programs";

interface NewProgramWizardProps {
  draft: NewProgramDraft;
  validationError: string | null;
  onDraftChange: (draft: NewProgramDraft) => void;
  onCancel: () => void;
  onPreview: () => void;
}

const DAYS = [
  { index: 1, label: "Mon" },
  { index: 2, label: "Tue" },
  { index: 3, label: "Wed" },
  { index: 4, label: "Thu" },
  { index: 5, label: "Fri" },
  { index: 6, label: "Sat" },
  { index: 0, label: "Sun" },
];

const CLUB_TYPES = [
  { value: "long", label: "Long run" },
  { value: "speed", label: "Speed work" },
  { value: "varies", label: "Varies" },
] as const;

function numberFromInput(value: string): number {
  return value === "" ? 0 : Number(value);
}

export function NewProgramWizard({
  draft,
  validationError,
  onDraftChange,
  onCancel,
  onPreview,
}: NewProgramWizardProps) {
  const abilityRange = draft.currentAbilityDist > 0
    ? getSliderRange(draft.currentAbilityDist)
    : null;
  const hasClub = draft.clubDay != null;

  const update = (patch: Partial<NewProgramDraft>) => {
    onDraftChange({ ...draft, ...patch });
  };

  const toggleDay = (day: number) => {
    const nextRunDays = draft.runDays.includes(day)
      ? draft.runDays.filter((d) => d !== day)
      : [...draft.runDays, day].sort((a, b) => a - b);

    if (nextRunDays.length === 0) return;

    const next: Partial<NewProgramDraft> = { runDays: nextRunDays };
    if (draft.longRunDay != null && !nextRunDays.includes(draft.longRunDay)) {
      next.longRunDay = nextRunDays.includes(0) ? 0 : nextRunDays[nextRunDays.length - 1];
    }
    if (draft.clubDay != null && !nextRunDays.includes(draft.clubDay)) {
      next.clubDay = undefined;
      next.clubType = undefined;
    }
    update(next);
  };

  const toggleClub = () => {
    if (hasClub) {
      update({ clubDay: undefined, clubType: undefined });
      return;
    }
    const firstNonLong = draft.runDays.find((day) => day !== draft.longRunDay);
    update({ clubDay: firstNonLong ?? draft.runDays[0], clubType: "varies" });
  };

  return (
    <section className="bg-surface border border-brand rounded-xl p-4 md:p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text">Start new program</h2>
          <p className="text-sm text-muted mt-1">
            Set the next race, check your current fitness, preview the plan, then choose when to replace future workouts.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted hover:text-text transition"
        >
          Cancel
        </button>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Race goal</h3>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_7rem_10rem] gap-3">
          <div>
            <label htmlFor="new-program-race-name" className="block text-xs text-muted mb-1">
              Race name
            </label>
            <input
              id="new-program-race-name"
              value={draft.raceName}
              onChange={(e) => { update({ raceName: e.target.value }); }}
              className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Stockholm Half"
            />
          </div>
          <div>
            <label htmlFor="new-program-race-distance" className="block text-xs text-muted mb-1">
              km
            </label>
            <input
              id="new-program-race-distance"
              type="number"
              min={1}
              max={100}
              value={draft.raceDist || ""}
              onChange={(e) => { update({ raceDist: numberFromInput(e.target.value) }); }}
              className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="new-program-race-date" className="block text-xs text-muted mb-1">
              Race date
            </label>
            <input
              id="new-program-race-date"
              type="date"
              value={draft.raceDate}
              onChange={(e) => { update({ raceDate: e.target.value }); }}
              className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Current fitness</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {DISTANCE_OPTIONS.map(({ label, km }) => (
            <button
              key={km}
              type="button"
              onClick={() => {
                update({
                  currentAbilityDist: km,
                  currentAbilitySecs: getDefaultGoalTime(km, "intermediate"),
                });
              }}
              className={`py-1.5 rounded-lg border text-xs font-semibold transition ${
                draft.currentAbilityDist === km
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {abilityRange && (
          <div>
            <p className="text-sm text-text font-semibold text-center">
              {formatGoalTime(draft.currentAbilitySecs)}
            </p>
            <input
              aria-label="Current fitness time"
              type="range"
              min={abilityRange.min}
              max={abilityRange.max}
              step={abilityRange.step}
              value={draft.currentAbilitySecs}
              onChange={(e) => { update({ currentAbilitySecs: Number(e.target.value) }); }}
              className="w-full accent-brand"
            />
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Schedule</h3>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map(({ index, label }) => (
            <button
              key={index}
              type="button"
              onClick={() => { toggleDay(index); }}
              className={`py-2 rounded-lg text-xs font-semibold transition ${
                draft.runDays.includes(index)
                  ? "bg-brand text-white"
                  : "border border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <p className="text-xs text-muted mb-1">Long run day</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.filter(({ index }) => draft.runDays.includes(index)).map(({ index, label }) => (
              <button
                key={index}
                type="button"
                onClick={() => { update({ longRunDay: index }); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  draft.longRunDay === index
                    ? "bg-brand text-white"
                    : "border border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Club run</p>
            <button
              type="button"
              role="switch"
              aria-label="Club run"
              aria-checked={hasClub}
              onClick={toggleClub}
              className={`relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors ${
                hasClub ? "bg-brand" : "bg-surface-alt"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  hasClub ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {hasClub && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.filter(({ index }) => draft.runDays.includes(index)).map(({ index, label }) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => { update({ clubDay: index }); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      draft.clubDay === index
                        ? "bg-brand text-white"
                        : "border border-border text-muted hover:border-brand hover:text-brand"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CLUB_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { update({ clubType: value }); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      draft.clubType === value
                        ? "bg-brand text-white"
                        : "border border-border text-muted hover:border-brand hover:text-brand"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Plan options</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="new-program-total-weeks" className="block text-xs text-muted mb-1">
              Total weeks
            </label>
            <input
              id="new-program-total-weeks"
              type="number"
              min={MIN_NEW_PROGRAM_WEEKS}
              max={30}
              value={draft.totalWeeks || ""}
              onChange={(e) => { update({ totalWeeks: numberFromInput(e.target.value) }); }}
              className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="new-program-start-km" className="block text-xs text-muted mb-1">
              Start km
            </label>
            <input
              id="new-program-start-km"
              type="number"
              min={2}
              max={30}
              value={draft.startKm || ""}
              onChange={(e) => { update({ startKm: numberFromInput(e.target.value) }); }}
              className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={draft.includeBasePhase}
            onChange={(e) => { update({ includeBasePhase: e.target.checked }); }}
            className="mt-1 accent-brand"
          />
          <span>
            <span className="block text-sm font-semibold text-text">Include base phase</span>
            <span className="block text-xs text-muted">Adds easy-only weeks before the build phase.</span>
          </span>
        </label>
      </div>

      {validationError && (
        <div className="bg-tint-error border border-error/20 rounded-lg px-3 py-2">
          <p className="text-sm text-error">{validationError}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onPreview}
          className="flex-1 py-2 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20"
        >
          Preview plan
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run component tests**

Run:

```bash
npm test -- app/components/__tests__/NewProgramWizard.integration.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/NewProgramWizard.tsx app/components/__tests__/NewProgramWizard.integration.test.tsx
git commit -m "feat: add returning runner program wizard"
```

---

## Task 4: Wire New Program State Into Planner

**Files:**
- Modify: `app/screens/PlannerScreen.tsx`
- Test: `app/components/__tests__/PlannerScreen.integration.test.tsx`

- [ ] **Step 1: Add imports**

In `app/screens/PlannerScreen.tsx`, add:

```ts
import { getThresholdPace } from "@/lib/paceTable";
import {
  buildDefaultNewProgramDraft,
  buildProgramConfigKey,
  getProgramWeeks,
  isProgramFinished,
  toSettingsUpdate,
  validateNewProgramDraft,
  type NewProgramDraft,
} from "@/lib/programs";
import { NewProgramWizard } from "../components/NewProgramWizard";
```

Keep the existing `generatePlan`, `uploadPlan`, `syncToGoogleCalendar`, and `toSyncEvents` imports.

- [ ] **Step 2: Add local state**

Near the existing plan state in `PlannerScreen`:

```ts
type NewProgramMode = "closed" | "editing" | "preview";

const [newProgramMode, setNewProgramMode] = useState<NewProgramMode>("closed");
const [newProgramDraft, setNewProgramDraft] = useState<NewProgramDraft | null>(null);
const [newProgramError, setNewProgramError] = useState<string | null>(null);
```

- [ ] **Step 3: Replace current config key calculation**

Replace the current `currentConfigKey` object with a key that includes all generation-affecting fields:

```ts
const currentConfigKey = settings
  ? JSON.stringify({
      runDays: [...(settings.runDays ?? [])].sort((a, b) => a - b),
      longRunDay: settings.longRunDay,
      clubDay: settings.clubDay,
      clubType: settings.clubType,
      raceDate: settings.raceDate,
      raceDist: settings.raceDist,
      raceName: settings.raceName,
      currentAbilitySecs: settings.currentAbilitySecs,
      currentAbilityDist: settings.currentAbilityDist,
      totalWeeks: settings.totalWeeks,
      startKm: settings.startKm,
      includeBasePhase: settings.includeBasePhase ?? false,
    })
  : null;
```

Keep `scheduleChanged` working by guarding null:

```ts
const scheduleChanged = lastGeneratedConfig != null && currentConfigKey != null && currentConfigKey !== lastGeneratedConfig;
```

- [ ] **Step 4: Add derived completion state**

After `hasUploadedPlan`:

```ts
const programFinished = settings
  ? isProgramFinished(settings, calendarEvents)
  : false;
```

- [ ] **Step 5: Add start/edit/preview/cancel handlers**

Inside `PlannerScreen`, before `handleGenerate`:

```ts
const beginNewProgram = () => {
  if (!settings) return;
  setNewProgramDraft(buildDefaultNewProgramDraft(settings));
  setNewProgramMode("editing");
  setNewProgramError(null);
  setStatusMsg("");
  setPlanEvents([]);
};

const cancelNewProgram = () => {
  setNewProgramDraft(null);
  setNewProgramMode("closed");
  setNewProgramError(null);
  setPlanEvents([]);
};

const previewNewProgram = () => {
  if (!settings || !newProgramDraft) return;

  const error = validateNewProgramDraft(newProgramDraft);
  if (error) {
    setNewProgramError(error);
    return;
  }
  if (!connected) {
    setNewProgramError("Intervals.icu not connected.");
    return;
  }
  if (settings.hrZones?.length !== 5) {
    setNewProgramError("HR zones not synced from Intervals.icu.");
    return;
  }

  const events = generatePlan({
    bgModel: bgModel ?? null,
    raceDateStr: newProgramDraft.raceDate,
    raceDist: newProgramDraft.raceDist,
    totalWeeks: getProgramWeeks(newProgramDraft.raceDate),
    startKm: newProgramDraft.startKm,
    lthr,
    hrZones: settings.hrZones,
    includeBasePhase: newProgramDraft.includeBasePhase,
    diabetesMode,
    runDays: newProgramDraft.runDays,
    longRunDay: newProgramDraft.longRunDay ?? 0,
    clubDay: newProgramDraft.clubDay,
    clubType: newProgramDraft.clubType,
    currentAbilitySecs: newProgramDraft.currentAbilitySecs,
    currentAbilityDist: newProgramDraft.currentAbilityDist,
  });

  const todayFilter = new Date();
  todayFilter.setHours(0, 0, 0, 0);
  setPlanEvents(events.filter((e) => e.start_date_local >= todayFilter));
  setNewProgramError(null);
  setStatusMsg("");
  setNewProgramMode("preview");
};
```

- [ ] **Step 6: Add final start handler**

Inside `PlannerScreen`, after `handleUpload`:

```ts
const handleStartNewProgram = async () => {
  if (!settings || !newProgramDraft) return;
  if (planEvents.length === 0) {
    setStatusMsg("Error: Preview a program before starting it");
    return;
  }
  if (!connected) {
    setStatusMsg("Error: Intervals.icu not connected");
    return;
  }

  setIsUploading(true);
  try {
    await updateSettings(toSettingsUpdate(newProgramDraft));

    const abilityChanged =
      newProgramDraft.currentAbilitySecs !== settings.currentAbilitySecs ||
      newProgramDraft.currentAbilityDist !== settings.currentAbilityDist;

    const threshold = getThresholdPace(
      newProgramDraft.currentAbilityDist,
      newProgramDraft.currentAbilitySecs,
    );

    if (abilityChanged && threshold && settings.intervalsConnected) {
      const res = await fetch("/api/intervals/threshold-pace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paceMinPerKm: threshold }),
      });
      if (!res.ok) throw new Error("Failed to push threshold pace");
    }

    const count = await uploadPlan(planEvents);
    void syncToGoogleCalendar("bulk-sync", { events: toSyncEvents(planEvents) });
    calendarReload();
    setLastGeneratedConfig(buildProgramConfigKey(newProgramDraft));
    setStatusMsg(`Started new program with ${count} workouts.`);
    setNewProgramMode("closed");
    setNewProgramDraft(null);
  } catch (e) {
    setStatusMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
  setIsUploading(false);
};
```

Important: keep `setIsUploading(false)` after the `try/catch`, matching the existing `handleUpload` style.

- [ ] **Step 7: Render the completion banner and action**

After the summary/config panel and before the schedule-changed banner:

```tsx
{programFinished && newProgramMode === "closed" && (
  <div className="bg-surface border border-success/30 rounded-xl px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
    <div>
      <p className="text-sm font-semibold text-text">
        {settings?.raceName ? `${settings.raceName} is complete.` : "Your program is complete."}
      </p>
      <p className="text-xs text-muted mt-0.5">
        Start a fresh plan for the next race without repeating account setup.
      </p>
    </div>
    <button
      type="button"
      onClick={beginNewProgram}
      className="px-4 py-2 bg-brand text-white rounded-lg font-bold text-sm hover:bg-brand-hover transition shadow-lg shadow-brand/20"
    >
      Start New Program
    </button>
  </div>
)}

{settings && newProgramMode === "closed" && !programFinished && (
  <button
    type="button"
    onClick={beginNewProgram}
    className="w-full py-2.5 border border-brand text-brand rounded-xl font-bold text-sm hover:bg-brand/10 transition"
  >
    Start New Program
  </button>
)}
```

- [ ] **Step 8: Render the wizard**

After the new program action:

```tsx
{newProgramMode === "editing" && newProgramDraft && (
  <NewProgramWizard
    draft={newProgramDraft}
    validationError={newProgramError}
    onDraftChange={setNewProgramDraft}
    onCancel={cancelNewProgram}
    onPreview={previewNewProgram}
  />
)}
```

- [ ] **Step 9: Adapt the generated-preview ActionBar**

Replace the existing `ActionBar` call with:

```tsx
<ActionBar
  workoutCount={planEvents.length}
  isUploading={isUploading}
  statusMsg={statusMsg}
  onUpload={() => { void (newProgramMode === "preview" ? handleStartNewProgram() : handleUpload()); }}
  onViewCalendar={() => { setSwitchTab("calendar"); }}
  readyTitle={newProgramMode === "preview" ? "Ready to start?" : undefined}
  readyDescription={
    newProgramMode === "preview"
      ? `${planEvents.length} workouts will replace future Springa-generated workouts. Completed runs and other calendar items are kept.`
      : undefined
  }
  actionLabel={newProgramMode === "preview" ? "Start Program" : undefined}
  uploadingTitle={newProgramMode === "preview" ? "Starting program..." : undefined}
  uploadingDescription={newProgramMode === "preview" ? "Saving settings and syncing workouts" : undefined}
  completeTitle={newProgramMode === "preview" ? "Program started" : undefined}
/>
```

- [ ] **Step 10: Hide normal generate buttons while editing**

Change the no-plan and active-plan generate sections so they only render when `newProgramMode === "closed"`:

```tsx
{newProgramMode === "closed" && planEvents.length === 0 && !hasUploadedPlan && (
  // existing Generate Plan block
)}
```

And:

```tsx
{newProgramMode === "closed" && planEvents.length === 0 && hasUploadedPlan && !scheduleChanged && (
  // existing Regenerate Plan button
)}
```

- [ ] **Step 11: Run Planner tests**

Run:

```bash
npm test -- app/components/__tests__/PlannerScreen.integration.test.tsx
```

Expected: Some new assertions are not written yet, but existing tests should pass. If an existing test finds two `Start New Program` buttons, scope new queries in later tests by role/name and prefer `getAllByRole` only when needed.

- [ ] **Step 12: Commit**

```bash
git add app/screens/PlannerScreen.tsx
git commit -m "feat: wire new program flow into planner"
```

---

## Task 5: Add Planner Integration Coverage

**Files:**
- Modify: `app/components/__tests__/PlannerScreen.integration.test.tsx`

- [ ] **Step 1: Add imports**

Add to the existing imports:

```ts
import { capturedUploadPayload, capturedPutPayload } from "@/lib/__tests__/msw/handlers";
import { lastGeneratedConfigAtom } from "@/app/atoms";
```

If `capturedPutPayload` is already imported by another test file only, import it directly from `lib/__tests__/msw/handlers.ts`.

- [ ] **Step 2: Add a completed settings helper**

Near `baseSettings`:

```ts
function completedProgramSettings(overrides?: Partial<UserSettings>): UserSettings {
  return baseSettings({
    raceName: "EcoTrail",
    raceDate: "2026-06-13",
    raceDist: 16,
    currentAbilityDist: 10,
    currentAbilitySecs: 3300,
    totalWeeks: 18,
    startKm: 8,
    ...overrides,
  });
}
```

- [ ] **Step 3: Add banner test**

Add inside `describe("PlannerScreen", () => { ... })`:

```tsx
it("shows a start new program banner after the race is complete", () => {
  render(<PlannerScreen />, {
    atomInits: [
      [settingsAtom, completedProgramSettings()],
      [calendarEventsAtom, []],
      [bgModelAtom, null],
    ],
  });

  expect(screen.getByText("EcoTrail is complete.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start New Program" })).toBeInTheDocument();
});
```

- [ ] **Step 4: Add preview-without-write test**

Add:

```tsx
it("previews a new program without saving settings or uploading workouts", async () => {
  const user = userEvent.setup();
  capturedUploadPayload.length = 0;

  render(<PlannerScreen />, {
    atomInits: [
      [settingsAtom, completedProgramSettings()],
      [calendarEventsAtom, []],
      [bgModelAtom, null],
    ],
  });

  await user.click(screen.getByRole("button", { name: "Start New Program" }));
  await user.click(screen.getByRole("button", { name: "Preview plan" }));

  expect(screen.getByText("Ready to start?")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start Program" })).toBeInTheDocument();
  expect(screen.getByText(/will replace future Springa-generated workouts/i)).toBeInTheDocument();
  expect(capturedUploadPayload).toHaveLength(0);
});
```

This verifies no upload happened. The settings save assertion is covered by the final confirmation test because the MSW handler captures the `PUT /api/settings` payload there.

- [ ] **Step 5: Add too-soon validation test**

Add:

```tsx
it("blocks preview when the new race date is too soon", async () => {
  const user = userEvent.setup();
  const { container } = render(<PlannerScreen />, {
    atomInits: [
      [settingsAtom, completedProgramSettings()],
      [calendarEventsAtom, []],
      [bgModelAtom, null],
    ],
  });

  await user.click(screen.getByRole("button", { name: "Start New Program" }));

  const dateInput = container.querySelector("#new-program-race-date");
  if (!dateInput) throw new Error("new program date input missing");
  await user.clear(dateInput);
  await user.type(dateInput, "2026-08-01");
  await user.click(screen.getByRole("button", { name: "Preview plan" }));

  expect(screen.getByText("Race date must be at least 12 weeks away.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Start Program" })).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Add final confirmation test**

Add:

```tsx
it("saves settings and uploads workouts when starting the previewed program", async () => {
  const user = userEvent.setup();
  capturedUploadPayload.length = 0;

  render(<PlannerScreen />, {
    atomInits: [
      [settingsAtom, completedProgramSettings()],
      [calendarEventsAtom, []],
      [bgModelAtom, null],
      [lastGeneratedConfigAtom, null],
    ],
  });

  await user.click(screen.getByRole("button", { name: "Start New Program" }));
  await user.type(screen.getByLabelText("Race name"), "Stockholm Half");
  await user.click(screen.getByRole("button", { name: "Preview plan" }));
  await user.click(screen.getByRole("button", { name: "Start Program" }));

  await waitFor(() => {
    expect(screen.getByText(/Started new program with \d+ workouts/)).toBeInTheDocument();
  });

  expect(capturedUploadPayload.length).toBeGreaterThan(0);
  expect(capturedPutPayload?.url).toContain("/api/settings");
  expect(capturedPutPayload?.body).toEqual(
    expect.objectContaining({
      raceName: "Stockholm Half",
      raceDist: 16,
      currentAbilityDist: 10,
      currentAbilitySecs: 3300,
      startKm: 8,
      includeBasePhase: false,
    }),
  );
});
```

If `capturedPutPayload` in `handlers.ts` only captures Intervals event PUTs, do not reuse it. Instead add a local MSW handler in this test:

```ts
let capturedSettingsBody: unknown = null;
server.use(
  http.put("/api/settings", async ({ request }) => {
    capturedSettingsBody = await request.json();
    return HttpResponse.json({ ok: true });
  }),
);
```

Then assert `capturedSettingsBody` instead of `capturedPutPayload`.

- [ ] **Step 7: Run Planner tests**

Run:

```bash
npm test -- app/components/__tests__/PlannerScreen.integration.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/components/__tests__/PlannerScreen.integration.test.tsx
git commit -m "test: cover returning runner program flow"
```

---

## Task 6: Full Verification

**Files:**
- No file changes unless a verification failure reveals a bug in files touched above.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- lib/__tests__/programs.test.ts app/components/__tests__/NewProgramWizard.integration.test.tsx app/components/__tests__/PlannerScreen.integration.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run type check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run all tests if time allows**

Run:

```bash
npm test
```

Expected: PASS. If this is too slow for the session, record that focused tests, type check, and lint passed.

- [ ] **Step 5: Manual browser check**

Run:

```bash
npm run dev
```

Open Planner, set a past race date in test data or use a local DB user with `raceDate: "2026-06-13"`, then verify:

1. Banner appears.
2. `Start New Program` opens the wizard.
3. Preview shows weekly chart and workouts.
4. Confirmation copy says future Springa-generated workouts are replaced and completed runs are kept.
5. Successful start shows `Started new program with X workouts.`
6. Calendar tab reloads with future workouts.

- [ ] **Step 6: Final commit if verification required fixes**

If verification required fixes:

```bash
git add app/screens/PlannerScreen.tsx app/components/ActionBar.tsx app/components/NewProgramWizard.tsx lib/programs.ts app/components/__tests__/PlannerScreen.integration.test.tsx app/components/__tests__/NewProgramWizard.integration.test.tsx lib/__tests__/programs.test.ts
git commit -m "fix: stabilize new program flow"
```

If no fixes were needed after Task 5, do not create an empty commit.

---

## Execution Notes For GPT 5.5 Medium

- Start with Task 1. Do not touch Planner before the pure helper tests pass.
- Keep `NewProgramWizard` controlled by props. It should not call fetch, Jotai, `generatePlan`, or `uploadPlan`.
- Keep all writes in `PlannerScreen`; this preserves one owner for program start side effects.
- Do not route returning users to `/setup`. That route owns account onboarding and redirects based on `onboardingComplete`.
- Do not add a database table or migration.
- Do not delete completed activities. The existing `uploadPlan()` path calls server-side `uploadToIntervals()`, which upserts future generated workouts and deletes stale future Springa workout events by `external_id`.
- If a test needs network behavior, use MSW handlers. Do not stub `fetch`.
- Use existing date-fns utilities. Avoid manual date string arithmetic.

## Self-Review

- Spec coverage: The plan covers completed-program detection, returning-runner entry points, draft-only editing, preview generation, explicit replacement confirmation, settings save, threshold sync, workout upload, Google Calendar sync, calendar reload, and tests.
- Placeholder scan: No unresolved implementation placeholders remain. The one conditional note about `capturedPutPayload` gives an exact fallback MSW handler.
- Type consistency: `NewProgramDraft`, `NewProgramMode`, and helper function names are consistent across helper code, component code, Planner integration, and tests.
