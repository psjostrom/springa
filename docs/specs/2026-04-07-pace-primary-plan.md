# Pace-Primary Core Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch workout prescription from HR zones to pace targets, add Karvonen HR zones as analysis guardrails, and derive pace tables from goal race time.

**Architecture:** New `lib/paceTable.ts` derives training paces from goal HM time (Ben Parkes model). `formatStep()` switches from LTHR% output to Intervals.icu `% pace` syntax. `computeKarvonenZones()` replaces the LTHR-based zone system for post-run analysis. Workout generators use pace zones instead of HR zone bands. `PlanContext` gains pace table, loses LTHR dependency for description formatting.

**Tech Stack:** TypeScript, Vitest, MSW, Intervals.icu API

**Spec:** `docs/specs/2026-04-07-pace-primary-zone-redesign.md`

**Scope:** Core engine only — pace table, Karvonen zones, description format, workout generators. Auto-update system (cardiac cost, race detection) and wizard UI changes are follow-up plans.

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `lib/paceTable.ts` | Derive pace table from goal HM time | Create |
| `lib/__tests__/paceTable.test.ts` | Pace table tests | Create |
| `lib/constants.ts` | Add `computeKarvonenZones()`, keep existing zone functions | Modify |
| `lib/__tests__/zones.test.ts` | Add Karvonen zone tests | Modify |
| `lib/descriptionBuilder.ts` | Switch `formatStep()` to pace % output | Modify |
| `lib/__tests__/descriptionBuilder.test.ts` | New test file for description builder | Create |
| `lib/types.ts` | Add `PaceRange` type, extend `PlanContext` | Modify |
| `lib/workoutGenerators.ts` | Switch `makeStep()` to pace-based output | Modify |
| `lib/__tests__/workoutGenerators.test.ts` | Update assertions from LTHR to pace | Modify |
| `lib/zoneText.ts` | Update `buildZoneBlock()` to show pace primary | Modify |
| `lib/__tests__/zoneText.test.ts` | Update assertions | Modify |
| `lib/settings.ts` | Add `goalTime` to `UserSettings` | Modify |
| `lib/coachContext.ts` | Update zone text in AI prompts | Modify |
| `lib/__tests__/coachContext.test.ts` | Update assertions | Modify |
| `docs/workout-reference.md` | Update all examples to pace format | Modify |

---

### Task 1: Pace table — derive training paces from goal HM time

**Files:**
- Create: `lib/paceTable.ts`
- Create: `lib/__tests__/paceTable.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/paceTable.test.ts
import { describe, it, expect } from "vitest";
import { getPaceTable } from "../paceTable";

describe("getPaceTable", () => {
  it("returns pace ranges for a 2h20 goal", () => {
    const table = getPaceTable(8400); // 2h20 in seconds
    // Race pace = 21.0975km / 8400s = 0.002512 km/s → 6.63 min/km
    expect(table.easy.min).toBeGreaterThan(7.0);
    expect(table.easy.max).toBeLessThan(8.1);
    expect(table.steady.min).toBeGreaterThan(6.4);
    expect(table.steady.max).toBeLessThan(6.8);
    expect(table.tempo.min).toBeGreaterThan(5.9);
    expect(table.tempo.max).toBeLessThan(6.3);
  });

  it("returns pace ranges for a 2h00 goal", () => {
    const table = getPaceTable(7200); // 2h00 in seconds
    // Race pace = 21.0975 / 7200 = 5.69 min/km
    expect(table.easy.min).toBeGreaterThan(6.0);
    expect(table.easy.max).toBeLessThan(7.1);
    expect(table.steady.min).toBeGreaterThan(5.5);
    expect(table.steady.max).toBeLessThan(5.8);
  });

  it("returns pace ranges for a 3h00 goal", () => {
    const table = getPaceTable(10800); // 3h00 in seconds
    // Race pace = 21.0975 / 10800 = 8.52 min/km
    expect(table.easy.min).toBeGreaterThan(8.9);
    expect(table.easy.max).toBeLessThan(10.3);
  });

  it("all paces follow easy > steady > tempo > hard", () => {
    for (const goalSecs of [7200, 8400, 9600, 10800]) {
      const table = getPaceTable(goalSecs);
      // Higher min/km = slower. Easy is slowest, hard is fastest.
      expect(table.easy.min).toBeGreaterThan(table.steady.min);
      expect(table.steady.min).toBeGreaterThan(table.tempo.min);
      expect(table.tempo.min).toBeGreaterThan(table.hard);
    }
  });

  it("validates against Ben Parkes 2h20 row", () => {
    const table = getPaceTable(8400);
    // Ben Parkes: Easy 7:03-7:46, HM Pace 6:29-6:41, Interval 6:00-6:13
    expect(table.easy.min).toBeCloseTo(7.05, 0); // ~7:03
    expect(table.easy.max).toBeCloseTo(7.77, 0); // ~7:46
    expect(table.steady.min).toBeCloseTo(6.48, 0); // ~6:29
    expect(table.steady.max).toBeCloseTo(6.68, 0); // ~6:41
    expect(table.tempo.min).toBeCloseTo(6.0, 0); // ~6:00
    expect(table.tempo.max).toBeCloseTo(6.22, 0); // ~6:13
  });

  it("returns null hard pace range (strides are effort-based)", () => {
    const table = getPaceTable(8400);
    expect(typeof table.hard).toBe("number"); // single pace, not a range
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/paceTable.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the pace table**

```typescript
// lib/paceTable.ts
import type { HRZoneName } from "./types";

const HM_DISTANCE_KM = 21.0975;

export interface PaceRange {
  min: number; // min/km (slower end)
  max: number; // min/km (faster end)
}

export interface PaceTableResult {
  easy: PaceRange;
  steady: PaceRange;
  tempo: PaceRange;
  hard: number; // single pace estimate (strides are effort-based, this is informational)
  racePacePerKm: number; // min/km
  goalTimeSecs: number;
}

/**
 * Derive training paces from goal half marathon time.
 * Based on Ben Parkes' pace chart, validated against Daniels VDOT.
 *
 * Ratios to race pace (consistent across ability levels):
 * - Easy:     110-120% of race pace (slower)
 * - Steady:   98-101% of race pace (≈ goal pace)
 * - Tempo:    90-94% of race pace (faster — ~5K effort)
 * - Hard:     ~85% of race pace (informational only)
 */
export function getPaceTable(goalTimeSecs: number): PaceTableResult {
  const racePacePerKm = goalTimeSecs / 60 / HM_DISTANCE_KM;

  return {
    easy: { min: racePacePerKm * 1.10, max: racePacePerKm * 1.20 },
    steady: { min: racePacePerKm * 0.98, max: racePacePerKm * 1.01 },
    tempo: { min: racePacePerKm * 0.90, max: racePacePerKm * 0.94 },
    hard: racePacePerKm * 0.85,
    racePacePerKm,
    goalTimeSecs,
  };
}

/** Estimate goal HM time from observed easy pace.
 *  easy_pace / 1.12 ≈ race_pace → race_pace * HM_DISTANCE * 60 = goal_time_secs.
 *  Rounds to nearest 5 minutes. */
export function estimateGoalTimeFromEasyPace(easyPaceMinPerKm: number): number {
  const racePace = easyPaceMinPerKm / 1.12;
  const rawSecs = racePace * HM_DISTANCE_KM * 60;
  return Math.round(rawSecs / 300) * 300; // round to nearest 5 min
}

/** Get the pace range for a specific zone name. */
export function getPaceRangeForZone(
  table: PaceTableResult,
  zone: HRZoneName,
): PaceRange | null {
  switch (zone) {
    case "easy": return table.easy;
    case "steady": return table.steady;
    case "tempo": return table.tempo;
    case "hard": return null; // strides are effort-based
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/paceTable.test.ts`
Expected: PASS (adjust `toBeCloseTo` precision if needed — the Ben Parkes validation test may need tuning to match the PDF values within rounding)

- [ ] **Step 5: Commit**

```
feat: add pace table — derive training paces from goal HM time
```

---

### Task 2: Karvonen zone computation

**Files:**
- Modify: `lib/constants.ts`
- Modify: `lib/__tests__/zones.test.ts`

- [ ] **Step 1: Write the failing test**

Add to existing `lib/__tests__/zones.test.ts`:

```typescript
import { computeKarvonenZones } from "../constants";

describe("computeKarvonenZones", () => {
  it("computes 5 zones from maxHR and restingHR", () => {
    const zones = computeKarvonenZones(193, 61);
    // HRR = 132
    // Z1: 50-60% → 127-140, Z2: 60-70% → 140-153, etc.
    expect(zones).toEqual([
      Math.round(132 * 0.60 + 61), // Z1 top: 140
      Math.round(132 * 0.70 + 61), // Z2 top: 153
      Math.round(132 * 0.80 + 61), // Z3 top: 167
      Math.round(132 * 0.90 + 61), // Z4 top: 180
      193,                          // Z5 top: maxHR
    ]);
  });

  it("works with different inputs", () => {
    const zones = computeKarvonenZones(180, 60);
    // HRR = 120
    expect(zones[0]).toBe(Math.round(120 * 0.60 + 60)); // 132
    expect(zones[4]).toBe(180);
  });

  it("produces zones compatible with classifyHR", () => {
    const zones = computeKarvonenZones(193, 61);
    expect(zones).toHaveLength(5);
    // Each zone ceiling should be higher than the previous
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i]).toBeGreaterThan(zones[i - 1]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/zones.test.ts`
Expected: FAIL — `computeKarvonenZones` not exported from constants

- [ ] **Step 3: Implement** (this function already exists on the branch — copy it)

Add to `lib/constants.ts`:

```typescript
/**
 * Compute 5 HR zones using the Karvonen formula.
 * Zone = (maxHR - restingHR) x %intensity + restingHR
 * Returns [Z1top, Z2top, Z3top, Z4top, Z5top].
 */
export function computeKarvonenZones(maxHr: number, restingHr: number): number[] {
  const hrr = maxHr - restingHr;
  return [
    Math.round(hrr * 0.60 + restingHr), // Z1 top: 60% HRR
    Math.round(hrr * 0.70 + restingHr), // Z2 top: 70% HRR
    Math.round(hrr * 0.80 + restingHr), // Z3 top: 80% HRR
    Math.round(hrr * 0.90 + restingHr), // Z4 top: 90% HRR
    maxHr,                               // Z5 top: maxHR
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/zones.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat: add computeKarvonenZones — HR zones from maxHR + restingHR
```

---

### Task 3: Switch `formatStep()` to pace output

**Files:**
- Modify: `lib/descriptionBuilder.ts`
- Create: `lib/__tests__/descriptionBuilder.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/descriptionBuilder.test.ts
import { describe, it, expect } from "vitest";
import { formatPaceStep, createWorkoutText } from "../descriptionBuilder";

describe("formatPaceStep", () => {
  it("formats a pace step with min-max percentage", () => {
    const result = formatPaceStep("10m", 80, 88);
    expect(result).toBe("10m 80-88% pace");
  });

  it("includes a note prefix when provided", () => {
    const result = formatPaceStep("2m", 105, 110, "Fast");
    expect(result).toBe("Fast 2m 105-110% pace");
  });

  it("formats a walk step with no pace target", () => {
    const result = formatPaceStep("2m", null, null, "Walk");
    expect(result).toBe("Walk 2m");
  });

  it("formats a distance-based step", () => {
    const result = formatPaceStep("3km", 95, 100, "Race Pace");
    expect(result).toBe("Race Pace 3km 95-100% pace");
  });

  it("formats an effort-based step (hills, strides)", () => {
    const result = formatPaceStep("2m", null, null, "Uphill");
    expect(result).toBe("Uphill 2m");
  });
});

describe("createWorkoutText", () => {
  it("builds a structured workout with sections", () => {
    const wu = "10m 80-88% pace intensity=warmup";
    const main = ["2m 105-110% pace intensity=active", "Walk 2m intensity=rest"];
    const cd = "5m 80-88% pace intensity=cooldown";
    const result = createWorkoutText(wu, main, cd, 6, "Speed work.");

    expect(result).toContain("Speed work.");
    expect(result).toContain("Warmup");
    expect(result).toContain("Main set 6x");
    expect(result).toContain("Cooldown");
    expect(result).toContain("80-88% pace");
    expect(result).not.toContain("LTHR");
    expect(result).not.toContain("bpm");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/descriptionBuilder.test.ts`
Expected: FAIL — `formatPaceStep` not exported

- [ ] **Step 3: Add `formatPaceStep` to descriptionBuilder.ts**

Keep the old `formatStep` (other code still references it during migration) and add the new function:

```typescript
/** Format a pace-based workout step for Intervals.icu.
 *  minPct/maxPct are Intervals.icu pace percentages (higher = faster).
 *  Pass null for both to create a step with no pace target (walk, effort-based). */
export function formatPaceStep(
  duration: string,
  minPct: number | null,
  maxPct: number | null,
  note?: string,
): string {
  const paceTarget = minPct != null && maxPct != null
    ? ` ${minPct}-${maxPct}% pace`
    : "";
  const prefix = note ? `${note} ` : "";
  return `${prefix}${duration}${paceTarget}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/descriptionBuilder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat: add formatPaceStep — Intervals.icu pace % workout step format
```

---

### Task 4: Switch `makeStep()` in workout generators to pace

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/workoutGenerators.ts`
- Modify: `lib/__tests__/workoutGenerators.test.ts`

This is the biggest task — it rewires how all workouts are generated.

- [ ] **Step 1: Add pace table to PlanContext**

In `lib/types.ts`, update `PlanContext`:

```typescript
import type { PaceTableResult } from "./paceTable";

export interface PlanContext {
  fuelInterval: number;
  fuelLong: number;
  fuelEasy: number;
  raceDate: Date;
  raceDist: number;

  totalWeeks: number;
  startKm: number;
  lthr: number;
  hrZones: number[];
  planStartMonday: Date;
  includeBasePhase: boolean;
  boundaries: import("./periodization").PhaseBoundaries;

  /** Pace table derived from goal time. Null = effort-based mode (no pace targets). */
  paceTable: PaceTableResult | null;
}
```

- [ ] **Step 2: Update the failing test assertions**

In `lib/__tests__/workoutGenerators.test.ts`, change the HR-format assertion (line 88-96):

```typescript
  it("has proper workout description format with pace targets", () => {
    const plan = generate();
    for (const event of plan) {
      if (event.name.includes("RACE DAY")) continue;
      if (event.name.includes("Club Run")) continue;
      expect(event.description).toContain("% pace");
      expect(event.description).not.toContain("LTHR");
    }
  });
```

Also update `testConstants.ts` to add a test goal time:

```typescript
/** Goal HM time for tests (2h20 = 8400 seconds). */
export const TEST_GOAL_TIME = 8400;
```

Update the `defaultArgs` in the test to include `goalTimeSecs`:

```typescript
  const defaultArgs = {
    bgModel: null,
    raceDateStr: "2026-06-13",
    raceDist: 16,
    totalWeeks: 12,
    startKm: 8,
    lthr: TEST_LTHR,
    hrZones: [...TEST_HR_ZONES],
    goalTimeSecs: TEST_GOAL_TIME,
  };
```

And update the `generate` helper to pass `goalTimeSecs`:

```typescript
  function generate(overrides: Partial<typeof defaultArgs> = {}) {
    const args = { ...defaultArgs, ...overrides };
    return generatePlan(
      args.bgModel,
      args.raceDateStr, args.raceDist,
      args.totalWeeks, args.startKm, args.lthr, args.hrZones,
      false, undefined, args.goalTimeSecs,
    );
  }
```

- [ ] **Step 3: Run tests to see current failures**

Run: `npx vitest run lib/__tests__/workoutGenerators.test.ts`
Expected: FAIL — tests assert `% pace` but generators still output LTHR

- [ ] **Step 4: Rewrite `makeStep()` in workoutGenerators.ts**

Replace the existing `makeStep` function. The zone-to-pace-percentage mapping:

```typescript
import { formatPaceStep } from "./descriptionBuilder";
import { getPaceTable } from "./paceTable";

/** Pace percentage ranges for Intervals.icu (higher % = faster).
 *  These are relative to threshold pace, not race pace. */
const ZONE_PACE_PCT: Record<ZoneName | "walk", { min: number | null; max: number | null }> = {
  walk:   { min: null, max: null },
  easy:   { min: 80, max: 88 },
  steady: { min: 95, max: 100 },
  tempo:  { min: 105, max: 110 },
  hard:   { min: null, max: null }, // effort-based
};

function makeStep(ctx: PlanContext) {
  return (duration: string, zone: ZoneName | "walk", note?: string) => {
    const pct = ZONE_PACE_PCT[zone];
    const step = formatPaceStep(
      duration,
      pct.min,
      pct.max,
      note ?? (zone === "walk" ? "Walk" : undefined),
    );
    return `${step} intensity=${garminIntensity(zone, note)}`;
  };
}
```

Note: this removes the dependency on `ctx.lthr`, `ctx.hrZones`, and `resolveZoneBand()` from the generators. Those functions remain in `constants.ts` for analysis code.

- [ ] **Step 5: Update `buildContext()` to accept and store `goalTimeSecs`**

```typescript
export function buildContext(
  bgModel: BGResponseModel | null,
  raceDateStr: string,
  raceDist: number,
  totalWeeks: number,
  startKm: number,
  lthr: number,
  hrZones: number[],
  includeBasePhase: boolean,
  diabetesMode?: boolean,
  goalTimeSecs?: number,
): PlanContext {
  const raceDate = parseISO(raceDateStr);
  return {
    fuelInterval: getCurrentFuelRate("interval", bgModel, diabetesMode),
    fuelLong: getCurrentFuelRate("long", bgModel, diabetesMode),
    fuelEasy: getCurrentFuelRate("easy", bgModel, diabetesMode),
    raceDate,
    raceDist,
    totalWeeks,
    startKm,
    lthr,
    hrZones,
    includeBasePhase,
    boundaries: getPhaseBoundaries(totalWeeks, includeBasePhase),
    planStartMonday: addWeeks(
      startOfWeek(raceDate, { weekStartsOn: 1 }),
      -(totalWeeks - 1),
    ),
    paceTable: goalTimeSecs ? getPaceTable(goalTimeSecs) : null,
  };
}
```

Update `generatePlan` signature to accept `goalTimeSecs` and pass it through.

- [ ] **Step 6: Update all callers of `generatePlan` and `buildContext`**

Search for all call sites of `generatePlan` and `buildContext` and add the new `goalTimeSecs` parameter. Key locations:
- `app/api/generate-plan/route.ts` (or wherever the plan generation API is)
- `generateSingleWorkout` in `workoutGenerators.ts`
- Any test files calling these functions

- [ ] **Step 7: Run tests**

Run: `npx vitest run lib/__tests__/workoutGenerators.test.ts`
Expected: PASS — descriptions now contain `% pace` instead of `LTHR`

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: Some tests in other files may still assert on LTHR format (e.g., `runAnalysisPrompt.test.ts`, `coachContext.test.ts`). Note which fail — they'll be fixed in subsequent tasks.

- [ ] **Step 9: Commit**

```
feat: switch workout generators from HR zones to pace targets

Workout descriptions now use Intervals.icu `% pace` syntax instead of
`% LTHR (bpm)`. Pace percentages are relative to threshold pace.
The `makeStep()` helper no longer depends on LTHR or hrZones for
description formatting — those remain for post-run analysis only.
```

---

### Task 5: Update zone text and coach context for pace-primary display

**Files:**
- Modify: `lib/zoneText.ts`
- Modify: `lib/__tests__/zoneText.test.ts`
- Modify: `lib/coachContext.ts`
- Modify: `lib/__tests__/coachContext.test.ts`

- [ ] **Step 1: Update `buildZoneBlock()` in zoneText.ts**

The zone block for AI prompts should show pace as primary with HR as secondary:

```typescript
import type { PaceTableResult } from "./paceTable";

export function buildZoneBlock(
  lthr: number,
  maxHr?: number,
  paceTable?: PaceTable,
  hrZones: number[] = [],
  paceTargets?: PaceTableResult | null,
): string {
  const table = paceTable ?? FALLBACK_PACE_TABLE;
  const garminZoneNum: Record<HRZoneName, string> = { easy: "Z2", steady: "Z3", tempo: "Z4", hard: "Z5" };

  if (hrZones.length !== 5) {
    return "(HR zones not available — sync from Intervals.icu)";
  }

  return ZONE_ORDER.map((zone) => {
    const band = resolveZoneBand(zone, lthr, hrZones);
    const lo = Math.floor(lthr * band.min);
    const hi = Math.min(Math.ceil(lthr * band.max), maxHr ?? Infinity);
    const label = getZoneLabel(zone);
    const zNum = garminZoneNum[zone];
    const entry = table[zone] ?? FALLBACK_PACE_TABLE[zone] ?? { zone, avgPace: 7.25, sampleCount: 0 };
    const paceStr = zone === "hard"
      ? `<${formatPace(entry.avgPace)}/km`
      : `~${formatPace(entry.avgPace)}/km`;
    return `- ${label}: ${paceStr} (${zNum}, ${lo}-${hi} bpm)`;
  }).join("\n");
}
```

Note: This function's signature changes to accept `paceTargets` but the implementation stays mostly the same for now — it already shows pace primary. The key change is that it continues to work with Karvonen zones. Update the tests accordingly.

- [ ] **Step 2: Update zoneText tests**

Ensure tests pass with the updated signature. No major assertion changes needed if the output format hasn't changed.

- [ ] **Step 3: Update coach context assertions**

In `lib/__tests__/coachContext.test.ts`, update any assertions that check for specific LTHR format strings to match the current output.

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/__tests__/zoneText.test.ts lib/__tests__/coachContext.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
refactor: update zone text and coach context for pace-primary display
```

---

### Task 6: Add `goalTime` to settings and update workout-reference.md

**Files:**
- Modify: `lib/settings.ts`
- Modify: `docs/workout-reference.md`

- [ ] **Step 1: Add `goalTime` to UserSettings type**

In `lib/settings.ts`, add to the `UserSettings` interface:

```typescript
  /** Goal race time in seconds. Null = unknown / effort-based mode. */
  goalTime?: number;
```

Add to `getUserSettings()` query and parsing:

```typescript
  if (row.goal_time != null) settings.goalTime = row.goal_time as number;
```

Add to `saveUserSettings()`:

```typescript
  if (partial.goalTime !== undefined) { sets.push("goal_time = ?"); args.push(partial.goalTime ?? null); }
```

- [ ] **Step 2: Add the column to SCHEMA_DDL**

Find the schema definition and add `goal_time INTEGER` to the `user_settings` table.

- [ ] **Step 3: Update workout-reference.md examples**

Replace all HR-format examples with pace format. For example, change:

```
- 10m 68-83% LTHR (115-140 bpm)
```

to:

```
- 10m 80-88% pace
```

Update all examples (A through G) to use the new format. Walk steps become just `Walk 2m`. Hills become `Uphill 2m hard effort`.

- [ ] **Step 4: Commit**

```
feat: add goalTime to settings, update workout-reference to pace format
```

---

### Task 7: Run full test suite and fix remaining failures

**Files:**
- Various test files that may assert on old LTHR format

- [ ] **Step 1: Run full test suite**

Run: `npm test`

- [ ] **Step 2: Fix each failing test**

Common patterns to fix:
- Tests asserting `event.description` contains "LTHR" or "bpm" → change to assert `% pace`
- Tests using `TEST_ZONE_STRINGS` (from testConstants.ts) → update or remove if no longer needed
- Tests in `runAnalysisPrompt.test.ts` that check zone text → update to match new format
- Tests in `adaptPlan.test.ts` that check zone text → update to match new format

- [ ] **Step 3: Run lint**

Run: `npm run lint`

- [ ] **Step 4: Run full suite again**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```
fix: update remaining tests for pace-primary workout format
```

---

### Task 8: Verify end-to-end — generate a plan and inspect output

**Files:** None (manual verification)

- [ ] **Step 1: Generate a plan in the test and inspect descriptions**

Add a focused integration assertion in `workoutGenerators.test.ts`:

```typescript
  it("generates pace-formatted descriptions end-to-end", () => {
    const plan = generateFull();
    const easyRun = plan.find((e) => e.name.includes("Easy") && !e.name.includes("Strides") && !e.name.includes("Bonus"));
    expect(easyRun).toBeDefined();
    // Should have pace % format, not LTHR
    expect(easyRun!.description).toContain("% pace");
    expect(easyRun!.description).not.toContain("LTHR");
    expect(easyRun!.description).not.toContain("bpm");
    // Should still have structure
    expect(easyRun!.description).toContain("Warmup");
    expect(easyRun!.description).toContain("Cooldown");
    expect(easyRun!.description).toContain("intensity=");

    const interval = plan.find((e) => e.name.includes("Intervals") || e.name.includes("Hills"));
    if (interval) {
      expect(interval.description).toContain("% pace");
      expect(interval.description).toContain("Walk 2m");
      expect(interval.description).not.toContain("LTHR");
    }

    const longRun = plan.find((e) => e.name.includes("Long"));
    if (longRun && !longRun.name.includes("RACE DAY")) {
      expect(longRun.description).toContain("% pace");
      expect(longRun.description).not.toContain("LTHR");
    }
  });
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run lib/__tests__/workoutGenerators.test.ts`
Expected: PASS

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```
test: add end-to-end pace format verification
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Pace table from goal time (Task 1)
- [x] Karvonen zones (Task 2)
- [x] Description format change (Task 3)
- [x] Workout generators switch to pace (Task 4)
- [x] Zone text / coach context update (Task 5)
- [x] `goalTime` in settings (Task 6)
- [x] Workout reference docs updated (Task 6)
- [ ] Auto-update system — **deferred to follow-up plan** (cardiac cost, race detection, periodic prompt)
- [ ] Wizard UI changes — **deferred to follow-up plan** (goal time picker, HR zone step)
- [ ] Intervals.icu threshold pace push — **deferred** (needs `% pace` semantics verification first, open question #1 in spec)

**Type consistency:** `PaceTableResult` used in Task 1 (definition), Task 4 (PlanContext), Task 5 (buildZoneBlock). `formatPaceStep` used in Task 3 (definition), Task 4 (makeStep). Consistent.

**ZONE_PACE_PCT values in Task 4:** These are placeholder percentages (80-88% for easy, etc.) that need calibration against real Intervals.icu behavior (spec open question #1). They're reasonable starting points but may need tuning after the Intervals.icu verification.
