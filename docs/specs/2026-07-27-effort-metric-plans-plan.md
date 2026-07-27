# Effort Metric Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support plan-level and per-workout effort metrics (`pace` | `hr` | `feel`) with structure-preserving target re-emit, Planner Done confirm, and a three-way EventModal dropdown.

**Architecture:** Persist `effortMetric` on the active program in `UserSettings`. Generators emit steps via an `effortMetric`-aware step maker (resurrect HR `formatStep` + `resolveZoneBand` from pre-`1ca0fab`). A shared `lib/reemitWorkout.ts` rewrites existing descriptions without changing structure. Planner Done classifies config diffs into target-only re-emit vs structural regenerate.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, MSW, Turso/`user_settings`, Intervals.icu event name/description.

**Spec:** `docs/specs/2026-07-27-effort-metric-plans-design.md`

## Global Constraints

- Default missing `effortMetric` → `"pace"` (backward compatible).
- Walk / Uphill / Stride / Free / Downhill stay targetless in all metrics.
- HR option requires synced `lthr` + `hrZones.length === 5`; otherwise disable with a short reason.
- Only rewrite **future planned** workouts; never completed or past-dated planned.
- Metric-only updates re-emit structure in place; structural schedule/race changes use full regenerate.
- Prefer resurrecting pre-pace-primary HR `makeStep` (`1ca0fab^`) over inventing new HR syntax.
- Specs/plans live under `docs/specs/` (not `docs/superpowers/`).
- Intervals.icu: duration uses `m`; capital `P` in `Pace`; fuel via `carbs_per_hour` only.
- No `vi.mock` except `@libsql/client` / `@/lib/auth`; no fetch mocking — use MSW.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/effortMetric.ts` | `EffortMetric` type, normalize/default, detect helpers, HR gate |
| `lib/reemitWorkout.ts` | Structure-preserving description + name rewrite |
| `lib/byFeel.ts` | Keep suffix helpers; used by re-emit feel branch |
| `lib/descriptionBuilder.ts` | Keep `formatStep` / `formatPaceStep` / `stripWorkoutTargets` |
| `lib/workoutGenerators.ts` | `effortMetric`-aware `createStepMaker`; drop `byFeel` |
| `lib/types.ts` | `PlanContext.effortMetric` |
| `lib/settings.ts` + `lib/db.ts` | Persist `effort_metric` |
| `scripts/migrate-effort-metric.ts` | One-shot production `ALTER TABLE` |
| `lib/programs.ts` | Draft/config key/diff classification |
| `app/components/EffortMetricSelect.tsx` | Shared three-option control |
| `app/components/EventModal.tsx` | Dropdown replaces By Feel button |
| `app/components/PlannerConfigPanel.tsx` | Plan metric control |
| `app/components/NewProgramWizard.tsx` | Metric in new-program draft |
| `app/setup/*` | Metric during first-plan setup |
| `app/screens/PlannerScreen.tsx` | Done confirm + bulk apply / regenerate |
| `app/components/WorkoutGenerator.tsx` | Pass plan metric + ability into replace |
| `lib/adaptPlan.ts` | Honor metric in `buildEasyStructure` |
| `docs/workout-reference.md` | Document three prescription modes |

---

### Task 1: `EffortMetric` type + settings persistence

**Files:**
- Create: `lib/effortMetric.ts`
- Create: `lib/__tests__/effortMetric.test.ts`
- Modify: `lib/types.ts` (export re-export or leave type in `effortMetric.ts` only)
- Modify: `lib/db.ts` (`SCHEMA_DDL` add `effort_metric TEXT`)
- Modify: `lib/settings.ts` (`UserSettings`, SELECT, save, `WRITABLE_SETTINGS_KEYS`)
- Create: `scripts/migrate-effort-metric.ts` (mirror `scripts/migrate-hr-zones-cache.ts`)
- Test: `lib/__tests__/settings.test.ts`

**Interfaces:**
- Produces:
  - `export type EffortMetric = "pace" | "hr" | "feel"`
  - `export function normalizeEffortMetric(value: unknown): EffortMetric` → missing/invalid → `"pace"`
  - `export function canUseHeartRateMetric(lthr?: number, hrZones?: number[]): boolean` → `!!lthr && hrZones?.length === 5`
  - `UserSettings.effortMetric?: EffortMetric`
  - Writable key `"effortMetric"`

- [ ] **Step 1: Write failing unit tests**

```ts
// lib/__tests__/effortMetric.test.ts
import { describe, it, expect } from "vitest";
import { normalizeEffortMetric, canUseHeartRateMetric } from "../effortMetric";
import { TEST_LTHR, TEST_HR_ZONES } from "./testConstants";

describe("normalizeEffortMetric", () => {
  it("defaults missing and invalid to pace", () => {
    expect(normalizeEffortMetric(undefined)).toBe("pace");
    expect(normalizeEffortMetric(null)).toBe("pace");
    expect(normalizeEffortMetric("nope")).toBe("pace");
  });
  it("passes through valid values", () => {
    expect(normalizeEffortMetric("hr")).toBe("hr");
    expect(normalizeEffortMetric("feel")).toBe("feel");
    expect(normalizeEffortMetric("pace")).toBe("pace");
  });
});

describe("canUseHeartRateMetric", () => {
  it("requires lthr and 5 zones", () => {
    expect(canUseHeartRateMetric(TEST_LTHR, [...TEST_HR_ZONES])).toBe(true);
    expect(canUseHeartRateMetric(undefined, [...TEST_HR_ZONES])).toBe(false);
    expect(canUseHeartRateMetric(TEST_LTHR, [120, 150])).toBe(false);
  });
});
```

Add `effortMetric: "hr"` to `testValues` in `lib/__tests__/settings.test.ts` writable roundtrip test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/effortMetric.test.ts lib/__tests__/settings.test.ts`

Expected: FAIL — module missing / `effortMetric` not in writable keys roundtrip.

- [ ] **Step 3: Implement type + settings + DDL + migrate script**

```ts
// lib/effortMetric.ts
export type EffortMetric = "pace" | "hr" | "feel";

const ALLOWED = new Set<EffortMetric>(["pace", "hr", "feel"]);

export function normalizeEffortMetric(value: unknown): EffortMetric {
  return typeof value === "string" && ALLOWED.has(value as EffortMetric)
    ? (value as EffortMetric)
    : "pace";
}

export function canUseHeartRateMetric(
  lthr?: number,
  hrZones?: number[],
): boolean {
  return typeof lthr === "number" && lthr > 0 && hrZones?.length === 5;
}
```

In `lib/db.ts` `SCHEMA_DDL` under `user_settings`, add: `effort_metric TEXT,`

In `lib/settings.ts`:
- `effortMetric?: EffortMetric` on interface (import type)
- SELECT includes `effort_metric`
- `if (row.effort_metric) settings.effortMetric = normalizeEffortMetric(row.effort_metric);`
- save: `if (partial.effortMetric !== undefined) { sets.push("effort_metric = ?"); args.push(partial.effortMetric ?? null); }`
- `"effortMetric"` in `WRITABLE_SETTINGS_KEYS`

`scripts/migrate-effort-metric.ts`: `ALTER TABLE user_settings ADD COLUMN effort_metric TEXT` with try/catch like hr-zones migrate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/effortMetric.test.ts lib/__tests__/settings.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/effortMetric.ts lib/__tests__/effortMetric.test.ts lib/db.ts lib/settings.ts lib/__tests__/settings.test.ts scripts/migrate-effort-metric.ts
git commit -m "feat: add effortMetric setting (pace/hr/feel)"
```

---

### Task 2: Program config key + draft wiring

**Files:**
- Modify: `lib/programs.ts`
- Modify: `lib/__tests__/programs.test.ts`

**Interfaces:**
- Consumes: `EffortMetric`, `normalizeEffortMetric`
- Produces:
  - `NewProgramDraft.effortMetric: EffortMetric`
  - Canonical config includes `effortMetric`
  - `PROGRAM_CONFIG_KEY_VERSION = 3`
  - `export type ProgramConfigDirtyKind = "none" | "target-only" | "structural"`
  - `export function classifyProgramConfigDirty(currentKey, storedKey): ProgramConfigDirtyKind`
  - Target-only fields: `effortMetric`, `currentAbilityDist`, `currentAbilitySecs`
  - Structural: everything else in canonical config (run days, race, weeks, club, startKm, base phase, …)
  - `toSettingsUpdate` / `buildDefaultNewProgramDraft` include metric (default `"pace"`)

- [ ] **Step 1: Write failing tests**

```ts
// In lib/__tests__/programs.test.ts — extend existing key tests
it("includes effortMetric in config key at version 3", () => {
  const draft = buildDefaultNewProgramDraft({ /* minimal valid settings */ });
  expect(draft.effortMetric).toBe("pace");
  const parsed = JSON.parse(buildProgramConfigKey({ ...draft, effortMetric: "hr" }));
  expect(parsed.version).toBe(3);
  expect(parsed.effortMetric).toBe("hr");
});

it("classifies metric-only change as target-only", () => {
  const base = buildDefaultNewProgramDraft(/* ... */);
  const a = buildProgramConfigKey(base);
  const b = buildProgramConfigKey({ ...base, effortMetric: "feel" });
  expect(classifyProgramConfigDirty(b, a)).toBe("target-only");
});

it("classifies runDays change as structural", () => {
  const base = buildDefaultNewProgramDraft(/* ... */);
  const a = buildProgramConfigKey(base);
  const b = buildProgramConfigKey({ ...base, runDays: [1, 3, 5] });
  expect(classifyProgramConfigDirty(b, a)).toBe("structural");
});

it("classifies mixed metric+days as structural", () => {
  const base = buildDefaultNewProgramDraft(/* ... */);
  const a = buildProgramConfigKey(base);
  const b = buildProgramConfigKey({ ...base, effortMetric: "hr", runDays: [2, 4, 6] });
  expect(classifyProgramConfigDirty(b, a)).toBe("structural");
});
```

Use the same draft fixtures already in `programs.test.ts`; do not invent a second fixture style.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run lib/__tests__/programs.test.ts`

- [ ] **Step 3: Implement**

Bump version to 3. Add `effortMetric` to `NewProgramDraft`, `ProgramConfigSource`, `buildCanonicalProgramConfig`, `buildDefaultNewProgramDraft` (`normalizeEffortMetric(settings.effortMetric)`), `toSettingsUpdate`.

```ts
const TARGET_ONLY_KEYS = new Set([
  "effortMetric",
  "currentAbilityDist",
  "currentAbilitySecs",
]);

export function classifyProgramConfigDirty(
  currentKey: string | null,
  storedKey: string | null,
): ProgramConfigDirtyKind {
  if (!currentKey || !storedKey) return "none";
  if (isProgramConfigKeyCurrent(currentKey, storedKey)) return "none";
  const current = JSON.parse(currentKey) as Record<string, unknown>;
  const stored = JSON.parse(storedKey) as Record<string, unknown>;
  const keys = new Set([...Object.keys(current), ...Object.keys(stored)]);
  let targetOnly = false;
  let structural = false;
  for (const key of keys) {
    if (key === "version") continue;
    if (JSON.stringify(current[key]) === JSON.stringify(stored[key])) continue;
    if (TARGET_ONLY_KEYS.has(key)) targetOnly = true;
    else structural = true;
  }
  if (structural) return "structural";
  if (targetOnly) return "target-only";
  return "none";
}
```

Keep `isProgramConfigKeyCurrent` legacy compatibility working for version &lt; 3 keys (metric absent ≡ pace when comparing if needed — document in comment: missing field vs `"pace"` should not spuriously dirty after upgrade; normalize both sides with `normalizeEffortMetric` when reading metric for compare if you add that normalization in canonical builder always emitting `"pace"`).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run lib/__tests__/programs.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/programs.ts lib/__tests__/programs.test.ts
git commit -m "feat: track effortMetric in program config key"
```

---

### Task 3: Generator step maker for three metrics

**Files:**
- Modify: `lib/types.ts` — replace `byFeel?: boolean` with `effortMetric?: EffortMetric`
- Modify: `lib/workoutGenerators.ts` — `PlanConfig`, `buildContext`, `createStepMaker`
- Modify: `lib/__tests__/workoutGenerators.test.ts` — migrate `byFeel: true` → `effortMetric: "feel"`; add HR cases
- Reference: `git show '1ca0fab^:lib/workoutGenerators.ts'` for HR `makeStep` shape

**Interfaces:**
- Consumes: `formatStep`, `formatPaceStep`, `resolveZoneBand`, `normalizeEffortMetric`
- Produces: generators honor `ctx.effortMetric`; walk/z1/z5 remain targetless for pace; walk stays targetless for HR (spec: effort-only stays targetless — **do not** resurrect old walk BPM band)

- [ ] **Step 1: Write failing tests**

```ts
it("effortMetric hr emits LTHR steps for easy main set", () => {
  const event = generateSingleWorkout("easy", buildThursday, {
    ...config,
    effortMetric: "hr",
  });
  expect(event.description).toMatch(/% LTHR \(\d+-\d+ bpm\)/);
  expect(event.description).not.toMatch(/\/km Pace|% pace/);
  expect(event.name).not.toMatch(/By Feel$/);
});

it("effortMetric feel strips targets and suffixes name", () => {
  const event = generateSingleWorkout("easy", buildThursday, {
    ...config,
    effortMetric: "feel",
  });
  expect(event.description).not.toMatch(/\/km Pace|% pace|% LTHR/);
  expect(event.description).toMatch(/intensity=/);
  expect(event.name.endsWith(" By Feel")).toBe(true);
});

it("effortMetric pace keeps current absolute or percent pace behavior", () => {
  const event = generateSingleWorkout("easy", buildThursday, config);
  expect(event.description).toMatch(/\/km Pace|% pace/);
});
```

Update existing `byFeel` tests to `effortMetric: "feel"`.

For feel naming: if generators today do **not** append ` By Feel`, add `addByFeel` at event construction when metric is feel (spec requires suffix at generate time).

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run lib/__tests__/workoutGenerators.test.ts`

- [ ] **Step 3: Implement `createStepMaker`**

```ts
import { formatPaceStep, formatStep } from "./descriptionBuilder";
import { resolveZoneBand } from "./constants";
import { normalizeEffortMetric, type EffortMetric } from "./effortMetric";
import { addByFeel } from "./byFeel";

function createStepMaker(
  thresholdPace: number | undefined,
  effortMetric: EffortMetric,
  hr?: { lthr: number; hrZones: number[] },
) {
  return (duration: string, zone: ZoneName | "walk", note?: string) => {
    const label = note ?? (zone === "walk" ? "Walk" : undefined);
    const intensity = `intensity=${garminIntensity(zone, note)}`;
    const pct = HM_ZONE_DEFAULTS[zone];
    const targetless = effortMetric === "feel" || pct.min == null || pct.max == null;

    if (targetless) {
      return `${formatPaceStep(duration, null, null, label, thresholdPace)} ${intensity}`;
    }

    if (effortMetric === "hr") {
      if (!hr) throw new Error("HR effortMetric requires lthr and hrZones");
      const band = resolveZoneBand(zone, hr.lthr, hr.hrZones);
      return `${formatStep(duration, band.min, band.max, hr.lthr, label)} ${intensity}`;
    }

    // pace
    return `${formatPaceStep(duration, pct.min, pct.max, label, thresholdPace)} ${intensity}`;
  };
}
```

Wire `buildContext` to set `effortMetric: normalizeEffortMetric(config.effortMetric)`. Replace every `createStepMaker(..., ctx.byFeel)` with:

```ts
createStepMaker(
  ctx.paceTable?.hmEquivalentPacePerKm,
  normalizeEffortMetric(ctx.effortMetric),
  { lthr: ctx.lthr, hrZones: ctx.hrZones },
);
```

When building event names for feel plans, apply `addByFeel(name)`.

Remove `byFeel` from `PlanConfig` / `PlanContext`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run lib/__tests__/workoutGenerators.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/workoutGenerators.ts lib/types.ts lib/__tests__/workoutGenerators.test.ts
git commit -m "feat: generate workouts by pace, HR, or feel"
```

---

### Task 4: `reemitWorkout` structure-preserving conversion

**Files:**
- Create: `lib/reemitWorkout.ts`
- Create: `lib/__tests__/reemitWorkout.test.ts`
- Extend: `lib/effortMetric.ts` with `detectEffortMetric(name, description)` if not already there

**Interfaces:**
- Produces:
  - `export function detectEffortMetric(name: string, description: string): EffortMetric`
  - `export function reemitWorkoutName(name: string, target: EffortMetric): string`
  - `export function reemitWorkoutDescription(description: string, target: EffortMetric, ctx: { lthr: number; hrZones: number[]; thresholdPace?: number }): string`
- Feel branch may call `stripWorkoutTargets`
- Must preserve section headers, notes, repeats, and `intensity=` tags (line-oriented like strip — **do not** round-trip solely through `parseWorkoutStructure`, which drops intensity)

- [ ] **Step 1: Write failing tests**

Use fixtures from `descriptionBuilder` tests / a sample easy + interval description.

```ts
const easyPace = `Warmup
- Warmup 10m 6:15-7:52/km Pace intensity=warmup

Main set
- Easy 35m 6:15-7:52/km Pace intensity=active

Cooldown
- Cooldown 15m 6:15-7:52/km Pace intensity=cooldown
`;

it("pace → hr keeps structure and intensity tags", () => {
  const out = reemitWorkoutDescription(easyPace, "hr", {
    lthr: TEST_LTHR,
    hrZones: [...TEST_HR_ZONES],
    thresholdPace: 5.5,
  });
  expect(out).toMatch(/Warmup/);
  expect(out).toMatch(/% LTHR \(\d+-\d+ bpm\)/);
  expect(out).toMatch(/intensity=warmup/);
  expect(out).toMatch(/intensity=active/);
  expect(out).not.toMatch(/\/km Pace/);
});

it("hr → feel strips targets", () => {
  const hr = reemitWorkoutDescription(easyPace, "hr", ctx);
  const feel = reemitWorkoutDescription(hr, "feel", ctx);
  expect(feel).not.toMatch(/% LTHR|\/km Pace|% pace/);
  expect(feel).toMatch(/Easy 35m intensity=active/);
});

it("feel → pace restores pace targets from labels/zones", () => {
  const feel = reemitWorkoutDescription(easyPace, "feel", ctx);
  const pace = reemitWorkoutDescription(feel, "pace", ctx);
  expect(pace).toMatch(/\/km Pace|% pace/);
});

it("walk/uphill stay targetless in all modes", () => {
  const hills = `Main set 6x
- Uphill 2m intensity=active
- Downhill 3m intensity=rest
`;
  for (const m of ["pace", "hr", "feel"] as const) {
    const out = reemitWorkoutDescription(hills, m, ctx);
    expect(out).toMatch(/Uphill 2m intensity=active/);
    expect(out).not.toMatch(/Uphill 2m .*LTHR|Uphill 2m .*Pace/);
  }
});

it("detectEffortMetric uses name suffix and description markers", () => {
  expect(detectEffortMetric("W05 Easy By Feel", feelDesc)).toBe("feel");
  expect(detectEffortMetric("W05 Easy", easyPace)).toBe("pace");
  expect(detectEffortMetric("W05 Easy", hrDesc)).toBe("hr");
});

it("reemitWorkoutName toggles By Feel suffix only", () => {
  expect(reemitWorkoutName("W05 Easy", "feel")).toBe("W05 Easy By Feel");
  expect(reemitWorkoutName("W05 Easy By Feel", "pace")).toBe("W05 Easy");
  expect(reemitWorkoutName("W05 Easy By Feel", "hr")).toBe("W05 Easy");
});
```

Also cover interval lines with labels `Interval` / `Race Pace`.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run lib/__tests__/reemitWorkout.test.ts`

- [ ] **Step 3: Implement**

Strategy (line-oriented):

1. Non-step lines (headers, blanks, notes without `- `) pass through.
2. For `- …` steps: parse duration token, optional label, existing target kind, trailing `intensity=…`.
3. Map label (Warmup/Easy/Interval/…) or inferred zone → `ZoneName` using same classification ideas as `stripWorkoutTargets` / parser.
4. If label is in always-targetless set (`Walk`, `Uphill`, `Downhill`, `Stride`, `Free`, …) OR mapped zone has null `HM_ZONE_DEFAULTS` → emit targetless `formatPaceStep(..., null, null, label)`.
5. Else emit `formatPaceStep` or `formatStep`+`resolveZoneBand` based on target metric.
6. On unparseable step line: throw `Error("Cannot re-emit workout step: …")`.

Export `HM_ZONE_DEFAULTS` from generators **or** duplicate the targetless-zone set in `reemitWorkout.ts` / share a tiny `lib/zoneTargets.ts` — prefer sharing one constant to avoid drift (extract `HM_ZONE_DEFAULTS` + targetless check to `lib/zoneTargets.ts` if both generator and re-emit need it; fold that extract into this task).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run lib/__tests__/reemitWorkout.test.ts lib/__tests__/workoutGenerators.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/reemitWorkout.ts lib/__tests__/reemitWorkout.test.ts lib/effortMetric.ts lib/zoneTargets.ts lib/workoutGenerators.ts
git commit -m "feat: re-emit workout descriptions across effort metrics"
```

---

### Task 5: Shared `EffortMetricSelect` + EventModal dropdown

**Files:**
- Create: `app/components/EffortMetricSelect.tsx`
- Modify: `app/components/EventModal.tsx`
- Modify: `app/components/__tests__/EventModal.integration.test.tsx`
- Modify: `app/components/__tests__/CalendarView.integration.test.tsx`

**Interfaces:**
- Consumes: `reemitWorkoutDescription`, `reemitWorkoutName`, `detectEffortMetric`, `canUseHeartRateMetric`
- Produces: planned-workout dropdown; replaces By Feel button; rename edit-mode `toggling-by-feel` → `changing-metric` (or keep internal name but update user-visible copy)

- [ ] **Step 1: Write failing integration tests**

Replace “By Feel” button tests:

```ts
it("changes a planned workout from pace to HR via dropdown", async () => {
  // render EventModal with planned pace event, lthr+hrZones props
  await user.click(screen.getByRole("combobox", { name: /effort|metric|by /i }));
  await user.click(screen.getByRole("option", { name: /heart rate/i }));
  await waitFor(() => {
    expect(capturedPutPayload.at(-1)).toEqual(
      expect.objectContaining({
        description: expect.stringMatching(/% LTHR/),
      }),
    );
  });
  expect(onEventUpdated).toHaveBeenCalled();
});

it("disables HR option when zones missing", async () => {
  // render without hrZones
  await user.click(screen.getByRole("combobox", { name: /effort|metric|by /i }));
  expect(screen.getByRole("option", { name: /heart rate/i })).toBeDisabled();
});
```

Adapt CalendarView test similarly (optimistic name for feel).

Use accessible name matching whatever `EffortMetricSelect` implements — prefer native `<select aria-label="Effort metric">` for simplicity and a11y contrast compliance with existing tokens.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run app/components/__tests__/EventModal.integration.test.tsx app/components/__tests__/CalendarView.integration.test.tsx`

- [ ] **Step 3: Implement select + EventModal wiring**

```tsx
// EffortMetricSelect.tsx — controlled <select>
// options: By Pace, By Heart Rate, By Feel
// disable hr when !canUseHeartRateMetric(lthr, hrZones)
// title/aria on disabled option: "Sync HR zones from Intervals.icu first"
```

EventModal handler:

```ts
const applyEffortMetric = async (target: EffortMetric) => {
  if (!onEventUpdated) return;
  if (target === "hr" && !canUseHeartRateMetric(lthr, hrZones)) return;
  const numericId = parseEventId(effectiveSelectedEvent.id);
  if (isNaN(numericId)) { /* fail */ return; }
  const patch = {
    name: reemitWorkoutName(effectiveSelectedEvent.name, target),
    description: reemitWorkoutDescription(
      effectiveSelectedEvent.description,
      target,
      { lthr, hrZones, thresholdPace: racePacePerKm },
    ),
  };
  // same updateEvent + onEventUpdated + Google sync pattern as toggleByFeel
};
```

Show control whenever `type === "planned" && onEventUpdated`. Selected value = `detectEffortMetric(name, description)`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run app/components/__tests__/EventModal.integration.test.tsx app/components/__tests__/CalendarView.integration.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add app/components/EffortMetricSelect.tsx app/components/EventModal.tsx app/components/__tests__/EventModal.integration.test.tsx app/components/__tests__/CalendarView.integration.test.tsx
git commit -m "feat: per-workout effort metric dropdown"
```

---

### Task 6: Planner / New Program / Setup UI controls

**Files:**
- Modify: `app/components/PlannerConfigPanel.tsx`
- Modify: `app/components/NewProgramWizard.tsx`
- Modify: `app/setup/page.tsx` + appropriate step (prefer schedule/goal step after Intervals profile is known — `ScheduleStep.tsx` or `AbilityStep.tsx`; if zones only exist after Intervals connect, place control on `ScheduleStep` or a small block in `DoneStep` / planner-equivalent; **choose `ScheduleStep`** and pass `lthr`/`hrZones` from setup page state)
- Modify: `app/components/__tests__/PlannerConfigPanel.integration.test.tsx` (and setup tests if present)
- Ensure `handleNewProgramDraftChange` / `toSettingsUpdate` persist metric

**Interfaces:**
- Consumes: `EffortMetricSelect`, `canUseHeartRateMetric`
- Produces: draft + settings include `effortMetric`; autosave on change like other Planner toggles

- [ ] **Step 1: Write failing UI tests**

PlannerConfigPanel: changing select calls `onSave` with `{ effortMetric: "feel" }`.

NewProgramWizard: draft change includes metric.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement controls**

In `PlannerConfigPanel`, local state `effortMetric` initialized from `settings.effortMetric ?? "pace"`, `saveField({ effortMetric })` on change.

In `NewProgramWizard`, add the same select bound to `draft.effortMetric`.

In setup, add select and include `effortMetric` in the payload that calls `generatePlan` / `saveUserSettings` on completion (mirror how `runDays` is passed today in `app/setup/page.tsx`).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: plan-level effort metric in Planner, new program, and setup"
```

---

### Task 7: Planner Done confirm + bulk target re-emit

**Files:**
- Modify: `app/screens/PlannerScreen.tsx`
- Modify: `app/components/PlannerConfigPanel.tsx` — `onDone` may need dirty awareness; prefer lifting confirm into `PlannerScreen` by changing `onDone` to async callback or comparing keys on Done
- Create helper if useful: `lib/applyEffortMetricToEvents.ts` with pure “build patches” + tested separately
- Tests: new `app/screens/__tests__/PlannerScreen.integration.test.tsx` or extend existing planner tests; unit test bulk patch builder

**Interfaces:**
- Consumes: `classifyProgramConfigDirty`, `reemitWorkout*`, `updateEvent`, calendar events, `lastGeneratedConfigAtom`
- Produces: Done → if dirty vs last generated and future planned exist → confirm modal; target-only → bulk re-emit; structural → existing regenerate path; decline → settings kept, workouts unchanged; set `lastGeneratedConfig` only if all target-only updates succeeded

- [ ] **Step 1: Write failing tests**

Unit: given events + metric change, patch builder returns N patches with HR descriptions.

Integration (MSW): Done after metric change → confirm → PUT events → `lastGeneratedConfig` updated.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement Done flow**

On Done from expanded config:

1. Ensure latest settings saved (panel already autosaves; still blur-save race fields).
2. `dirty = classifyProgramConfigDirty(currentConfigKey, lastGeneratedConfig)`.
3. If `dirty === "none"` or no future planned → just collapse.
4. Else open confirm: “Update future workouts to match your new settings?”
5. Confirm + `target-only`: for each future `type==="planned"` event, compute patch; `updateEvent`; optimistic calendar update; Google sync best-effort; if any re-emit throws, count failure and skip that event; if any failure → do not update `lastGeneratedConfig`; show status string with counts.
6. Confirm + `structural`: call existing `handleGenerate()` / schedule-changed regenerate upload path (same as today’s banner action).
7. Decline: collapse panel only.

Keep the existing schedule-changed banner as a fallback for users who saved without going through Done, or route banner CTA through the same classifier.

- [ ] **Step 4: Run — expect PASS**

Run focused planner + unit tests, then `npm test` if feasible.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: confirm and apply plan config changes on Planner Done"
```

---

### Task 8: Replace, on-demand, adaptPlan, and remaining `generatePlan` callers

**Files:**
- Modify: `app/components/WorkoutGenerator.tsx` — pass `effortMetric`, `currentAbilitySecs/Dist`, `runDays` from settings
- Modify: `lib/adaptPlan.ts` — `buildEasyStructure(duration, metric, ctx)`
- Modify: `app/setup/page.tsx`, `app/page.tsx`, `app/screens/IntelScreen.tsx`, `app/screens/PlannerScreen.tsx` — pass `effortMetric: normalizeEffortMetric(settings.effortMetric)` into `generatePlan`
- Tests: adaptPlan unit if present; WorkoutGenerator integration if present; update any generatePlan snapshots

**Interfaces:**
- Replace/on-demand use plan metric (spec decision A)

- [ ] **Step 1: Write failing tests** for adaptPlan easy structure under `hr` and `feel`; WorkoutGenerator config includes metric.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement caller wiring**

```ts
// WorkoutGenerator planConfig
effortMetric: normalizeEffortMetric(settings.effortMetric),
currentAbilitySecs: settings.currentAbilitySecs,
currentAbilityDist: settings.currentAbilityDist,
runDays: settings.runDays,
```

```ts
// adaptPlan buildEasyStructure — branch like createStepMaker or call a shared exported makeStepLine helper from workoutGenerators/zoneTargets
```

If exporting `createStepMaker` is awkward (private), add `lib/stepPrescription.ts` with `prescribeStep({ duration, zone, note, metric, thresholdPace, lthr, hrZones })` used by generators, re-emit, and adaptPlan — only extract if Task 3/4 did not already share enough. Prefer minimal duplication over large drive-by refactors.

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run lib/__tests__/adaptPlan.test.ts app/components/__tests__/WorkoutGenerator*` (adjust to actual test paths)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: honor effortMetric in replace, adapt, and plan generation callers"
```

---

### Task 9: Docs + final verification

**Files:**
- Modify: `docs/workout-reference.md` — add short “Effort metrics” section: pace / HR / feel examples; point at plan setting + per-workout dropdown
- Run full verification

- [ ] **Step 1: Update workout-reference with three example step lines**

```md
## Effort metrics

Plans and individual workouts can prescribe intensity by:

- **Pace:** `10m 6:49-20:00/km Pace` (or `% pace` without ability)
- **Heart rate:** `10m 68-83% LTHR (115-140 bpm)`
- **Feel:** `Easy 10m` (no numeric target; name ends with ` By Feel`)
```

- [ ] **Step 2: Run full checks**

```bash
npm run lint
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add docs/workout-reference.md
git commit -m "docs: document pace, HR, and feel workout metrics"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| `effortMetric` on settings/draft/config key | 1–2 |
| Generate pace/HR/feel | 3 |
| Structure-preserving re-emit + detect + name suffix | 4 |
| EventModal dropdown replaces By Feel | 5 |
| Setup + Planner + New Program controls; HR gate | 1, 5–6 |
| Done confirm; target-only vs structural | 2, 7 |
| Replace/on-demand/adapt use plan metric | 8 |
| Future planned only; no completed rewrite | 5, 7 |
| Historical HR `formatStep` resurrection | 3–4 |
| Docs | 9 |
| Production ALTER | 1 (`scripts/migrate-effort-metric.ts`) |

## Placeholder / consistency check

- Types consistently named `EffortMetric` / values `"pace" | "hr" | "feel"`.
- No TBD steps; shared select component named `EffortMetricSelect`.
- Config version **3**; dirty classifier field sets listed explicitly.
