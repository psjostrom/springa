# Planner Tab Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Planner tab as the single hub for plan management — collapsed config bar, schedule editing, race goal, club run config, and three UI states (empty → preview → active).

**Architecture:** Add scheduling columns to DB + settings layer. Re-implement `assignDayRoles()` in workoutGenerators. Rebuild PlannerScreen with a collapsible config bar (summary/expanded), three states based on plan existence, and a schedule-changed banner. Move race goal from SettingsModal to the Planner config panel.

**Tech Stack:** Next.js 16 App Router, TypeScript, Turso/libsql, Jotai, Tailwind, Vitest + MSW

---

## File Structure

**New files:**
- `app/components/PlannerSummaryBar.tsx` — collapsed config summary (one-liner + Edit button)
- `app/components/PlannerConfigPanel.tsx` — expanded config (run days, long run day, club run, race goal)

**Modified files:**
- `lib/types.ts` — add scheduling fields to `PlanContext`
- `lib/db.ts` — add `long_run_day`, `club_day`, `club_type` columns to `SCHEMA_DDL`
- `lib/settings.ts` — add `longRunDay`, `clubDay`, `clubType` to `UserSettings` + read/write
- `app/api/settings/route.ts` — allow new fields in PUT allowlist
- `lib/workoutGenerators.ts` — add `assignDayRoles()`, `DayRole`, `SchedulingConfig`, refactor `generateWeekEvents` to role-based
- `app/screens/PlannerScreen.tsx` — full redesign with summary bar, config panel, three states
- `app/components/ActionBar.tsx` — no changes (kept as-is, used in preview state)
- `app/components/SettingsModal.tsx` — remove race goal fields

**Test files:**
- `lib/__tests__/workoutGenerators.test.ts` — add `assignDayRoles` tests
- `lib/__tests__/settings.test.ts` — add scheduling field read/write tests (if exists, else inline)
- `app/components/__tests__/PlannerScreen.integration.test.tsx` — new: integration tests for planner states

---

### Task 1: Add scheduling columns to DB schema and settings layer

**Files:**
- Modify: `lib/db.ts:18-41` (SCHEMA_DDL)
- Modify: `lib/settings.ts:5-33` (UserSettings type), `lib/settings.ts:37-71` (getUserSettings), `lib/settings.ts:73-109` (saveUserSettings)
- Modify: `app/api/settings/route.ts:99-113` (PUT allowlist)

- [ ] **Step 1: Write test for scheduling field round-trip**

Add to the existing settings tests or create inline. Uses in-memory SQLite.

```typescript
// In lib/__tests__/settings.test.ts or wherever settings tests live
import { describe, it, expect, vi, beforeEach } from "vitest";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  return { holder: { db: null as import("@libsql/client").Client | null } };
});
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

import { getUserSettings, saveUserSettings } from "../settings";
import { SCHEMA_DDL } from "../db";

describe("scheduling fields", () => {
  beforeEach(async () => {
    // Reset schema
    for (const stmt of SCHEMA_DDL.split(";").filter((s) => s.trim())) {
      await holder.db!.execute(stmt);
    }
    await holder.db!.execute("DELETE FROM user_settings");
  });

  it("round-trips longRunDay, clubDay, clubType", async () => {
    await saveUserSettings("test@example.com", {
      longRunDay: 0,
      clubDay: 5,
      clubType: "speed",
    });

    const settings = await getUserSettings("test@example.com");
    expect(settings.longRunDay).toBe(0);
    expect(settings.clubDay).toBe(5);
    expect(settings.clubType).toBe("speed");
  });

  it("saves null when clearing scheduling fields", async () => {
    await saveUserSettings("test@example.com", { longRunDay: 0 });
    await saveUserSettings("test@example.com", { longRunDay: undefined });

    const settings = await getUserSettings("test@example.com");
    expect(settings.longRunDay).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/settings.test.ts --reporter=verbose`
Expected: FAIL — `longRunDay` not in UserSettings type, columns don't exist in SCHEMA_DDL

- [ ] **Step 3: Add columns to SCHEMA_DDL**

In `lib/db.ts`, add three columns after `run_days TEXT`:

```typescript
// In SCHEMA_DDL, after the run_days line:
  long_run_day       INTEGER,
  club_day           INTEGER,
  club_type          TEXT,
```

- [ ] **Step 4: Add fields to UserSettings type**

In `lib/settings.ts`, add to the `UserSettings` interface after `runDays`:

```typescript
  longRunDay?: number;
  clubDay?: number;
  clubType?: string;
```

- [ ] **Step 5: Add read logic to getUserSettings**

In `lib/settings.ts`, add to the SELECT query:

```sql
long_run_day, club_day, club_type
```

And add parsing after the `runDays` line:

```typescript
  if (row.long_run_day != null) settings.longRunDay = row.long_run_day as number;
  if (row.club_day != null) settings.clubDay = row.club_day as number;
  if (row.club_type) settings.clubType = row.club_type as string;
```

- [ ] **Step 6: Add write logic to saveUserSettings**

In `lib/settings.ts`, add to the `saveUserSettings` function after the `runDays` handler:

```typescript
  if (partial.longRunDay !== undefined) { sets.push("long_run_day = ?"); args.push(partial.longRunDay ?? null); }
  if (partial.clubDay !== undefined) { sets.push("club_day = ?"); args.push(partial.clubDay ?? null); }
  if (partial.clubType !== undefined) { sets.push("club_type = ?"); args.push(partial.clubType ?? null); }
```

- [ ] **Step 7: Add fields to settings route PUT allowlist**

In `app/api/settings/route.ts`, add after the `runDays` line (~line 112):

```typescript
  if (body.longRunDay !== undefined) allowed.longRunDay = body.longRunDay;
  if (body.clubDay !== undefined) allowed.clubDay = body.clubDay;
  if (body.clubType !== undefined) allowed.clubType = body.clubType;
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/settings.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 9: Run full test suite**

Run: `npm test`
Expected: All existing tests still pass

- [ ] **Step 10: Commit**

```
feat: add scheduling columns (long_run_day, club_day, club_type)

Add to DB schema, UserSettings type, and settings API route.
Round-trip tested with in-memory SQLite.
```

---

### Task 2: Re-implement assignDayRoles and refactor workout generation

**Files:**
- Modify: `lib/types.ts:31-45` (PlanContext)
- Modify: `lib/workoutGenerators.ts` (add assignDayRoles, SchedulingConfig, refactor generateWeekEvents)
- Modify: `lib/__tests__/workoutGenerators.test.ts` (add assignDayRoles tests)

- [ ] **Step 1: Write assignDayRoles tests**

Add to the top of `lib/__tests__/workoutGenerators.test.ts`, inside a new `describe("assignDayRoles")` block. Import `assignDayRoles` and `DayRole` from `../workoutGenerators`.

```typescript
import { generatePlan, generateSingleWorkout, suggestCategory, buildContext, getWeekPhase, assignDayRoles } from "../workoutGenerators";
import type { OnDemandCategory, DayRole } from "../workoutGenerators";

describe("assignDayRoles", () => {
  it("assigns long + easy for 2-day schedule (no speed)", () => {
    const roles = assignDayRoles([2, 0], 0); // Tue + Sun, long on Sun
    expect(roles.get(0)).toBe("long");
    expect(roles.get(2)).toBe("easy");
    expect(roles.size).toBe(2);
  });

  it("assigns long + speed + easy for 3-day schedule", () => {
    const roles = assignDayRoles([2, 5, 0], 0); // Tue + Fri + Sun
    expect(roles.get(0)).toBe("long");
    const speedDay = [...roles.entries()].find(([, r]) => r === "speed");
    expect(speedDay).toBeDefined();
  });

  it("places speed as far from long run as possible", () => {
    const roles = assignDayRoles([1, 3, 5, 0], 0); // Mon/Wed/Fri/Sun, long=Sun
    // Wed (3) is distance 3 from Sun (0), Fri (5) is distance 2, Mon (1) is distance 1
    expect(roles.get(3)).toBe("speed");
  });

  it("assigns free runs for 5+ days", () => {
    const roles = assignDayRoles([1, 2, 3, 5, 0], 0);
    const freeRuns = [...roles.entries()].filter(([, r]) => r === "free");
    expect(freeRuns.length).toBe(1);
  });

  it("club replaces speed when clubType is speed", () => {
    const roles = assignDayRoles([2, 4, 6, 0], 0, 4, "speed");
    expect(roles.get(4)).toBe("club");
    const speedDays = [...roles.entries()].filter(([, r]) => r === "speed");
    expect(speedDays.length).toBe(0);
  });

  it("club coexists with speed when clubType is easy", () => {
    const roles = assignDayRoles([2, 4, 6, 0], 0, 4, "easy");
    expect(roles.get(4)).toBe("club");
    const speedDays = [...roles.entries()].filter(([, r]) => r === "speed");
    expect(speedDays.length).toBe(1);
  });

  it("no club run when clubDay is not set", () => {
    const roles = assignDayRoles([2, 6, 0], 0);
    const clubDays = [...roles.entries()].filter(([, r]) => r === "club");
    expect(clubDays.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/workoutGenerators.test.ts -t "assignDayRoles" --reporter=verbose`
Expected: FAIL — `assignDayRoles` not exported

- [ ] **Step 3: Implement assignDayRoles**

Add to `lib/workoutGenerators.ts` after the `OnDemandCategory` type (line 21):

```typescript
export type DayRole = "long" | "speed" | "easy" | "club" | "free";

/** Assign a training role to each selected run day.
 *  Roles: long (1), speed (0-1), club (0-1), easy (fill), free (extras beyond 4). */
export function assignDayRoles(
  runDays: number[],
  longRunDay: number,
  clubDay?: number,
  clubType?: string,
): Map<number, DayRole> {
  const roles = new Map<number, DayRole>();
  const sorted = [...runDays].sort((a, b) => a - b);

  // 1. Long run
  roles.set(longRunDay, "long");

  // 2. Club run (if configured and in runDays)
  if (clubDay != null && sorted.includes(clubDay)) {
    roles.set(clubDay, "club");
  }

  // 3. Speed — needed if 3+ days AND club doesn't cover speed
  const clubCoversSpeed = clubDay != null && clubType === "speed";
  const remaining = sorted.filter((d) => !roles.has(d));
  if (remaining.length > 0 && sorted.length >= 3 && !clubCoversSpeed) {
    let bestDay = remaining[0];
    let bestDist = 0;
    for (const d of remaining) {
      const dist = Math.min(Math.abs(d - longRunDay), 7 - Math.abs(d - longRunDay));
      if (dist > bestDist) { bestDist = dist; bestDay = d; }
    }
    roles.set(bestDay, "speed");
  }

  // 4. Fill remaining as easy (up to 4 total), then free
  const easyAndFree = sorted.filter((d) => !roles.has(d));
  for (const d of easyAndFree) {
    roles.set(d, roles.size < 4 ? "easy" : "free");
  }

  return roles;
}
```

- [ ] **Step 4: Run assignDayRoles tests to verify they pass**

Run: `npx vitest run lib/__tests__/workoutGenerators.test.ts -t "assignDayRoles" --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Add SchedulingConfig type and extend PlanContext**

In `lib/workoutGenerators.ts`, after `assignDayRoles`:

```typescript
export interface SchedulingConfig {
  runDays?: number[];
  longRunDay?: number;
  clubDay?: number;
  clubType?: string;
}
```

In `lib/types.ts`, add to `PlanContext` after `boundaries`:

```typescript
  runDays: number[];
  longRunDay: number;
  clubDay?: number;
  clubType?: string;
```

- [ ] **Step 6: Update buildContext to accept scheduling**

In `lib/workoutGenerators.ts`, update `buildContext` signature to accept an optional `scheduling` parameter and populate the new `PlanContext` fields:

```typescript
// Add scheduling param after diabetesMode:
  scheduling?: SchedulingConfig,

// At the end of the returned PlanContext object, add:
  runDays: scheduling?.runDays ?? [2, 5, 6, 0],       // default: Tue/Fri/Sat/Sun
  longRunDay: scheduling?.longRunDay ?? 0,              // default: Sunday
  clubDay: scheduling?.clubDay,
  clubType: scheduling?.clubType,
```

- [ ] **Step 7: Add dayToOffset helper and refactor generateWeekEvents**

Add helper before `generateWeekEvents`:

```typescript
/** Convert day-of-week (0=Sun..6=Sat) to offset from Monday-based weekStart (0=Mon..6=Sun). */
function dayToOffset(dayOfWeek: number): number {
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}
```

Replace the body of `generateWeekEvents`:

```typescript
function generateWeekEvents(ctx: PlanContext, weekIdx: number, weekStart: Date): WorkoutEvent[] {
  const wp = getWeekPhase(ctx, weekIdx);
  const roles = assignDayRoles(ctx.runDays, ctx.longRunDay, ctx.clubDay, ctx.clubType);
  const events: WorkoutEvent[] = [];
  let easyCount = 0;

  const sortedRoles = [...roles.entries()].sort((a, b) => dayToOffset(a[0]) - dayToOffset(b[0]));

  for (const [dayOfWeek, role] of sortedRoles) {
    const date = addDays(weekStart, dayToOffset(dayOfWeek));
    let event: WorkoutEvent | null = null;

    switch (role) {
      case "long":
        event = generateLongRun(ctx, weekIdx, date, wp);
        break;
      case "speed":
        event = generateQualityRun(ctx, weekIdx, date, wp);
        break;
      case "easy":
        event = generateEasyRun(ctx, weekIdx, date, wp, easyCount);
        easyCount++;
        break;
      case "club":
        event = buildClubRunEvent(date, wp, ctx.fuelInterval, `club-${wp.weekNum}`);
        break;
      case "free":
        event = generateEasyRun(ctx, weekIdx, date, wp, easyCount);
        easyCount++;
        break;
    }
    if (event) events.push(event);
  }

  return events;
}
```

- [ ] **Step 8: Update generator function signatures**

Update `generateEasyRun`, `generateQualityRun`, and `generateLongRun` to accept `date: Date` instead of `weekStart: Date` (remove the internal `addDays` call that computes the date). Add `easyIndex = 0` param to `generateEasyRun`.

For `generateEasyRun` (~line 189): change `weekStart: Date` → `date: Date`, add `easyIndex = 0` param, remove `const date = addDays(weekStart, 1)`, change strides condition to `easyIndex === 0 && weekIdx % 2 === 1`, change `external_id` to `` `easy-${wp.weekNum}-${date.getDay()}` ``.

For `generateQualityRun` (~line 72): change `weekStart: Date` → `date: Date`, remove `const date = addDays(weekStart, 3)`.

For `generateLongRun` (~line 284): change `weekStart: Date` → `date: Date`, remove `const date = addDays(weekStart, 6)`.

- [ ] **Step 9: Update generatePlan and generateFullPlan signatures**

Add `scheduling?: SchedulingConfig` as the last parameter to both functions. Pass it through to `buildContext`.

```typescript
export function generatePlan(
  bgModel: BGResponseModel | null,
  raceDateStr: string,
  raceDist: number,
  totalWeeks: number,
  startKm: number,
  lthr: number,
  hrZones: number[],
  includeBasePhase = false,
  diabetesMode?: boolean,
  scheduling?: SchedulingConfig,
): WorkoutEvent[] {
  const ctx = buildContext(bgModel, raceDateStr, raceDist, totalWeeks, startKm, lthr, hrZones, includeBasePhase, diabetesMode, scheduling);
  // ... rest unchanged
```

Same for `generateFullPlan`.

- [ ] **Step 10: Remove generatePlanClubRun and generateBonusRun**

Delete `generatePlanClubRun` and `generateBonusRun` functions — they're replaced by the role-based dispatch in `generateWeekEvents`.

- [ ] **Step 11: Update existing tests that assert on hardcoded days**

These tests will break because bonus runs are gone and days are now role-based:

1. **Delete** `"names Saturday runs with 'Bonus'"` — bonus runs no longer exist. Easy runs on Saturday will have `easy-N-6` IDs, not `bonus-` IDs.

2. **Delete** `"assigns bonus sessions to Saturday (day 6)"` — bonus runs replaced by the role system.

3. **Delete** `"bonus runs use WU/main/CD structure with 15m cooldown"` — bonus runs are gone. Easy run cooldowns are handled by the regular easy run generator.

4. **Rewrite** `"assigns easy sessions to Tuesday (day 2)"` — now depends on default runDays `[2, 5, 6, 0]`. With the defaults, easy runs land on the days assigned the "easy" role by `assignDayRoles`. Assert that all non-speed/long/club events have easy-style external IDs.

5. **Rewrite** `"assigns club runs to Thursday (day 4)"` → `"generates club run when clubDay is configured"`. Pass `scheduling: { runDays: [2, 4, 6, 0], longRunDay: 0, clubDay: 4, clubType: "varies" }` to `generatePlan` and assert club runs appear on day 4.

6. **Rewrite** `"generates club run on Thursday every week"` → same as above.

7. **Delete** `"does not generate speed/quality sessions in the plan"` if it asserts on absence of Thursday quality runs — the role system now generates speed on the farthest-from-long day.

- [ ] **Step 12: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 12: Commit**

```
feat: re-implement assignDayRoles and role-based workout generation

Pure function maps run days to training roles (long/speed/easy/club/free).
Generators now accept date param instead of computing from weekStart.
generatePlan/generateFullPlan accept optional SchedulingConfig.
```

---

### Task 3: Build PlannerSummaryBar component

**Files:**
- Create: `app/components/PlannerSummaryBar.tsx`

- [ ] **Step 1: Create PlannerSummaryBar**

```tsx
"use client";

import type { UserSettings } from "@/lib/settings";
import { differenceInWeeks, parseISO } from "date-fns";

interface PlannerSummaryBarProps {
  settings: UserSettings;
  hasPlan: boolean;
  onEdit: () => void;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PlannerSummaryBar({ settings, hasPlan, onEdit }: PlannerSummaryBarProps) {
  const dayCount = settings.runDays?.length ?? 0;
  const longRunLabel = settings.longRunDay != null ? DAY_LABELS[settings.longRunDay] : "auto";

  const raceSegment = settings.raceName
    ? settings.raceName + (settings.raceDist ? ` ${settings.raceDist}km` : "")
    : settings.raceDist
      ? `${settings.raceDist}km`
      : null;

  const weeksToGo = settings.raceDate
    ? differenceInWeeks(parseISO(settings.raceDate), new Date())
    : null;

  return (
    <div className="bg-surface-alt border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-2">
      <div className="text-sm text-text truncate flex items-center gap-1 flex-wrap">
        <span>{dayCount} days/wk</span>
        <span className="text-border-subtle">&middot;</span>
        <span>Long: {longRunLabel}</span>
        {raceSegment && (
          <>
            <span className="text-border-subtle">&middot;</span>
            <span>{raceSegment}</span>
          </>
        )}
        {hasPlan && weeksToGo != null && weeksToGo > 0 && (
          <>
            <span className="text-border-subtle">&middot;</span>
            <span className="text-success">{weeksToGo} wks to go</span>
          </>
        )}
      </div>
      <button
        onClick={onEdit}
        className="text-brand text-sm font-medium shrink-0 hover:underline"
      >
        Edit
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat: add PlannerSummaryBar component

Collapsed one-liner showing day count, long run day, race goal,
and weeks-to-go countdown. Tapping Edit expands config panel.
```

---

### Task 4: Build PlannerConfigPanel component

**Files:**
- Create: `app/components/PlannerConfigPanel.tsx`

- [ ] **Step 1: Create PlannerConfigPanel**

```tsx
"use client";

import { useState } from "react";
import type { UserSettings } from "@/lib/settings";

interface PlannerConfigPanelProps {
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
  onDone: () => void;
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

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CLUB_TYPES = [
  { value: "long", label: "Long run" },
  { value: "speed", label: "Speed work" },
  { value: "varies", label: "Varies" },
] as const;

export function PlannerConfigPanel({ settings, onSave, onDone }: PlannerConfigPanelProps) {
  const [runDays, setRunDays] = useState<number[]>(settings.runDays ?? []);
  const [longRunDay, setLongRunDay] = useState<number | undefined>(settings.longRunDay);
  const [hasClub, setHasClub] = useState(settings.clubDay != null);
  const [clubDay, setClubDay] = useState<number | undefined>(settings.clubDay);
  const [clubType, setClubType] = useState<string>(settings.clubType ?? "varies");
  const [raceName, setRaceName] = useState(settings.raceName ?? "");
  const [raceDist, setRaceDist] = useState<number | "">(settings.raceDist ?? "");
  const [raceDate, setRaceDate] = useState(settings.raceDate ?? "");

  // When club type is "long", the club day IS the long run day
  const effectiveLongRunDay = hasClub && clubType === "long" && clubDay != null ? clubDay : longRunDay;

  // Available days for club day picker (selected run days minus long run day)
  const clubDayOptions = runDays.filter((d) => d !== effectiveLongRunDay || clubType === "long");

  const saveField = async (partial: Partial<UserSettings>) => {
    await onSave(partial);
  };

  const toggleDay = (day: number) => {
    const next = runDays.includes(day)
      ? runDays.filter((d) => d !== day)
      : [...runDays, day].sort((a, b) => a - b);
    if (next.length === 0) return;
    setRunDays(next);
    // Clear long run day if it's no longer in run days
    if (longRunDay != null && !next.includes(longRunDay)) {
      setLongRunDay(undefined);
      void saveField({ runDays: next, longRunDay: undefined });
    } else {
      void saveField({ runDays: next });
    }
  };

  const handleLongRunDay = (day: number) => {
    setLongRunDay(day);
    void saveField({ longRunDay: day });
  };

  const handleClubToggle = () => {
    const next = !hasClub;
    setHasClub(next);
    if (!next) {
      setClubDay(undefined);
      void saveField({ clubDay: undefined, clubType: undefined });
    }
  };

  const handleClubDay = (day: number) => {
    setClubDay(day);
    void saveField({ clubDay: day });
  };

  const handleClubType = (type: string) => {
    setClubType(type);
    const updates: Partial<UserSettings> = { clubType: type };
    if (type === "long" && clubDay != null) {
      updates.longRunDay = clubDay;
      setLongRunDay(clubDay);
    }
    void saveField(updates);
  };

  const handleRaceBlur = () => {
    const updates: Partial<UserSettings> = {};
    if (raceName.trim() !== (settings.raceName ?? "")) updates.raceName = raceName.trim();
    if (raceDate !== (settings.raceDate ?? "")) updates.raceDate = raceDate;
    const rdVal = raceDist === "" ? undefined : Number(raceDist);
    if (rdVal !== settings.raceDist) updates.raceDist = rdVal;
    if (Object.keys(updates).length > 0) {
      void saveField(updates);
    }
  };

  // Compute speed hint
  const speedHintDay = (() => {
    if (effectiveLongRunDay == null) return null;
    const available = runDays.filter((d) => d !== effectiveLongRunDay && !(hasClub && d === clubDay));
    if (available.length === 0 || runDays.length < 3) return null;
    let bestDay = available[0];
    let bestDist = 0;
    for (const d of available) {
      const dist = Math.min(Math.abs(d - effectiveLongRunDay), 7 - Math.abs(d - effectiveLongRunDay));
      if (dist > bestDist) { bestDist = dist; bestDay = d; }
    }
    return DAY_LABELS[bestDay];
  })();

  return (
    <div className="bg-surface-alt border border-brand rounded-xl p-4 space-y-4">
      {/* Run Days */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Run Days</div>
        <div className="flex gap-1.5">
          {DAYS.map(({ index, label }) => (
            <button
              key={index}
              onClick={() => { toggleDay(index); }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                runDays.includes(index)
                  ? "bg-brand text-white"
                  : "border border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Long Run Day */}
      {!(hasClub && clubType === "long") && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Long Run Day</div>
          <div className="flex gap-1.5 flex-wrap">
            {runDays.map((d) => (
              <button
                key={d}
                onClick={() => { handleLongRunDay(d); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  longRunDay === d
                    ? "bg-brand text-white"
                    : "border border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
          {speedHintDay && (
            <p className="text-[10px] text-muted mt-1.5">Speed auto-assigned to {speedHintDay}</p>
          )}
        </div>
      )}

      {/* Club Run */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Club Run</div>
          <button
            type="button"
            role="switch"
            aria-checked={hasClub}
            onClick={handleClubToggle}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
              hasClub ? "bg-brand" : "bg-surface"
            }`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              hasClub ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
        </div>
        {hasClub && (
          <div className="space-y-2">
            <div className="flex gap-1.5 flex-wrap">
              {clubDayOptions.map((d) => (
                <button
                  key={d}
                  onClick={() => { handleClubDay(d); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    clubDay === d
                      ? "bg-brand text-white"
                      : "border border-border text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {CLUB_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => { handleClubType(value); }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition ${
                    clubType === value
                      ? "bg-brand text-white"
                      : "border border-border text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {clubType === "speed" && (
              <p className="text-[10px] text-muted">Springa skips its own speed session</p>
            )}
            {clubType === "long" && clubDay != null && (
              <p className="text-[10px] text-muted">Club day ({DAY_LABELS[clubDay]}) is the long run day</p>
            )}
          </div>
        )}
      </div>

      {/* Race Goal */}
      <div className="border-t border-border pt-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Race Goal</div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-muted mb-1">Name</label>
              <input
                type="text"
                value={raceName}
                onChange={(e) => { setRaceName(e.target.value); }}
                onBlur={handleRaceBlur}
                className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="EcoTrail Stockholm"
              />
            </div>
            <div className="w-20">
              <label className="block text-[10px] text-muted mb-1">km</label>
              <input
                type="number"
                min={1}
                max={200}
                value={raceDist}
                onChange={(e) => { setRaceDist(e.target.value === "" ? "" : Number(e.target.value)); }}
                onBlur={handleRaceBlur}
                className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="16"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1">Date</label>
            <input
              type="date"
              value={raceDate}
              onChange={(e) => { setRaceDate(e.target.value); }}
              onBlur={handleRaceBlur}
              className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
            />
          </div>
        </div>
      </div>

      {/* Done */}
      <div className="flex justify-end">
        <button
          onClick={onDone}
          className="text-brand text-sm font-medium hover:underline"
        >
          Done
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat: add PlannerConfigPanel component

Expanded config panel with run days grid, long run day picker,
club run toggle + type pills, and race goal fields.
Save-on-change for schedule fields, save-on-blur for race goal.
```

---

### Task 5: Redesign PlannerScreen with three states

**Files:**
- Modify: `app/screens/PlannerScreen.tsx` (full rewrite of the render)

- [ ] **Step 1: Add config state and scheduling to PlannerScreen**

At the top of the component, add:

```typescript
const [configExpanded, setConfigExpanded] = useState(false);
const [scheduleChanged, setScheduleChanged] = useState(false);
const [lastGeneratedConfig, setLastGeneratedConfig] = useState<string | null>(null);
```

Add a helper to detect if the schedule has changed since last generation:

```typescript
const currentConfigKey = JSON.stringify({
  runDays: settings?.runDays,
  longRunDay: settings?.longRunDay,
  clubDay: settings?.clubDay,
  clubType: settings?.clubType,
  raceDate: settings?.raceDate,
  raceDist: settings?.raceDist,
});

useEffect(() => {
  if (lastGeneratedConfig && currentConfigKey !== lastGeneratedConfig) {
    setScheduleChanged(true);
  }
}, [currentConfigKey, lastGeneratedConfig]);
```

- [ ] **Step 2: Update handleGenerate to pass scheduling and track config**

```typescript
const handleGenerate = () => {
  if (!connected) {
    setStatusMsg("Intervals.icu not connected");
    return;
  }
  if (settings?.hrZones?.length !== 5) {
    setStatusMsg("HR zones not synced from Intervals.icu");
    return;
  }
  const scheduling = {
    runDays: settings.runDays,
    longRunDay: settings.longRunDay,
    clubDay: settings.clubDay,
    clubType: settings.clubType,
  };
  const events = generatePlan(bgModel ?? null, raceDate, raceDist, totalWeeks, startKm, lthr, settings.hrZones, settings.includeBasePhase ?? false, diabetesMode, scheduling);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  setPlanEvents(events.filter((e) => e.start_date_local >= today));
  setStatusMsg("");
  setScheduleChanged(false);
  setLastGeneratedConfig(currentConfigKey);
};
```

- [ ] **Step 3: Add handleSettingsSave helper using updateSettingsAtom**

Import and use `updateSettingsAtom` from `app/atoms.ts` — it both PUTs to `/api/settings` AND updates the local settingsAtom. This is critical because `currentConfigKey` (schedule change detection) reads from settingsAtom.

```typescript
// Add to imports from atoms:
import {
  // ... existing imports ...
  updateSettingsAtom,
} from "../atoms";

// Add inside the component:
const updateSettings = useSetAtom(updateSettingsAtom);

const handleSettingsSave = async (partial: Partial<UserSettings>) => {
  await updateSettings(partial);
};
```

- [ ] **Step 4: Add hasUploadedPlan and hasPlannedEvents derivations**

```typescript
// hasUploadedPlan: calendar has future planned events (plan was uploaded)
const today = new Date();
today.setHours(0, 0, 0, 0);
const hasUploadedPlan = calendarEvents.some(
  (e) => e.type === "planned" && e.date >= today,
);

// hasPlannedEvents: keep existing derivation for the adapt section
const hasPlannedEvents = calendarEvents.some((e) => e.type === "planned");
```

- [ ] **Step 5: Rewrite the render with three states**

Replace the entire return block of PlannerScreen. Import the new components:

```typescript
import { PlannerSummaryBar } from "../components/PlannerSummaryBar";
import { PlannerConfigPanel } from "../components/PlannerConfigPanel";
```

The render structure:

```tsx
return (
  <div className="h-full overflow-y-auto bg-bg">
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      {/* Config: Summary Bar or Expanded Panel */}
      {settings && (
        configExpanded ? (
          <PlannerConfigPanel
            settings={settings}
            onSave={handleSettingsSave}
            onDone={() => { setConfigExpanded(false); }}
          />
        ) : (
          <PlannerSummaryBar
            settings={settings}
            hasPlan={hasUploadedPlan}
            onEdit={() => { setConfigExpanded(true); }}
          />
        )
      )}

      {/* Schedule Changed Banner */}
      {scheduleChanged && hasUploadedPlan && (
        <div className="bg-surface-alt border border-warning rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-warning text-sm">Schedule changed</span>
          <button
            onClick={handleGenerate}
            className="bg-warning text-black px-3 py-1 rounded-lg text-xs font-bold"
          >
            Regenerate
          </button>
        </div>
      )}

      {/* State 1: No plan — show Generate button */}
      {planEvents.length === 0 && !hasUploadedPlan && (
        <>
          <button
            onClick={handleGenerate}
            className="w-full py-3 bg-brand text-white rounded-xl font-bold text-base hover:bg-brand-hover transition shadow-lg shadow-brand/20"
          >
            Generate Plan
          </button>
          <div className="h-32 flex flex-col items-center justify-center text-muted border border-dashed border-border rounded-xl">
            <span className="text-2xl mb-1">🏃</span>
            <span className="text-sm">Generate a plan to see your workouts</span>
          </div>
        </>
      )}

      {/* State 3: Plan active — show Regenerate button */}
      {planEvents.length === 0 && hasUploadedPlan && !scheduleChanged && (
        <button
          onClick={handleGenerate}
          className="w-full py-3 border border-brand text-brand rounded-xl font-bold text-sm hover:bg-brand/10 transition"
        >
          Regenerate Plan
        </button>
      )}

      {/* State 2: Plan generated (preview) — show volume chart + workout list + upload */}
      {planEvents.length > 0 && (
        <>
          <WeeklyVolumeChart data={chartData} />
          <ActionBar
            workoutCount={planEvents.length}
            isUploading={isUploading}
            statusMsg={statusMsg}
            onUpload={() => { void handleUpload(); }}
            onViewCalendar={() => { setSwitchTab("calendar"); }}
          />
          <WorkoutList events={planEvents} />
        </>
      )}

      {/* Fuel rates (diabetes mode only) */}
      {diabetesMode && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Fuel rates <span className="text-muted">g/h</span>
          </span>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {(["easy", "long", "interval"] as const).map((cat) => {
              const rate = getCurrentFuelRate(cat, bgModel);
              const isDefault = rate === DEFAULT_FUEL[cat] && !bgModel;
              return (
                <div key={cat} className="flex flex-col text-xs text-muted gap-1">
                  <span className="capitalize">{cat}</span>
                  <span className={`text-sm font-medium ${isDefault ? "text-muted" : "text-brand"}`}>
                    {rate} g/h{isDefault ? " (default)" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Adapt Upcoming — copy the existing adapt section from current PlannerScreen.tsx lines 307-406 unchanged.
         This is the block starting with {hasPlannedEvents && ( and ending with the closing </div> of the adapt card. */}
    </div>
  </div>
);
```

- [ ] **Step 7: Run lint and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```
feat: redesign PlannerScreen with collapsed config and three states

Summary bar shows schedule at a glance, expands to full config panel.
Three states: empty (generate), preview (upload), active (regenerate).
Schedule-changed banner prompts regeneration when config drifts.
```

---

### Task 6: Remove race goal from SettingsModal

**Files:**
- Modify: `app/components/SettingsModal.tsx`

- [ ] **Step 1: Remove race goal state and fields**

Remove these state declarations:
- `const [raceDate, setRaceDate] = ...`
- `const [raceName, setRaceName] = ...`
- `const [raceDist, setRaceDist] = ...`

Remove the race goal comparison logic from `handleSave` (lines 86-95).

Remove the Race Date input (lines 168-179) and the "Race & Plan" section's race name and distance inputs (lines 187-208). Keep totalWeeks and startKm — those are plan config, not race goal.

Update the "Race & Plan" section header to just "Plan" since race fields are gone.

- [ ] **Step 2: Run lint and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass. Check `SettingsModal.integration.test.tsx` — if it tests race goal fields, update it to remove those assertions.

- [ ] **Step 4: Commit**

```
refactor: move race goal from SettingsModal to Planner

Race goal (name, date, distance) now lives exclusively on the
Planner tab's config panel. Removes duplicate write path.
```

---

### Task 7: Integration test for Planner states

**Files:**
- Create: `app/components/__tests__/PlannerScreen.integration.test.tsx`

- [ ] **Step 1: Write integration tests**

Test the three Planner states by rendering PlannerScreen with different atom values. Use the test utils from `lib/__tests__/test-utils.tsx` and MSW handlers. Key scenarios:

1. **Empty state:** No plan events, no calendar events → shows "Generate Plan" button and empty state
2. **Preview state:** After clicking Generate → shows volume chart, workout list, and upload button
3. **Active state:** Calendar has future planned events → shows "Regenerate Plan" button
4. **Config panel:** Click Edit → config panel appears with run days, long run day
5. **Schedule changed banner:** Change a setting after plan exists → amber banner appears

Use `userEvent.click` for interactions. Query by role and text. Mock only at the network boundary (MSW).

- [ ] **Step 2: Run the tests**

Run: `npx vitest run app/components/__tests__/PlannerScreen.integration.test.tsx --reporter=verbose`
Expected: PASS

- [ ] **Step 3: Commit**

```
test: add PlannerScreen integration tests

Tests three states (empty/preview/active), config panel toggle,
and schedule-changed banner. Uses MSW for network boundary.
```

---

### Task 8: Final verification and cleanup

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run dev server and manual smoke test**

Run: `npm run dev`

Verify:
- Planner tab shows summary bar with current config
- Edit opens config panel
- Run days toggle works
- Long run day picker shows only selected days
- Club run toggle + type pills work
- Generate produces a plan preview
- Upload syncs to Intervals.icu
- After upload, Regenerate button appears
- Changing config shows schedule-changed banner
- Settings modal no longer has race goal fields

- [ ] **Step 5: Commit any cleanup**

```
chore: planner redesign cleanup and final fixes
```
