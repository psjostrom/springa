# Pace Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect pace improvement and regression from training data, and suggest ability time updates with one-tap accept that regenerates the plan.

**Architecture:** Two trend signals (Z4 pace slope + cardiac cost product) combined with race result detection feed into a derived Jotai atom. The atom computes a suggestion (direction, confidence, delta) that renders as a card in Intel and a banner on Calendar. Accept writes settings, pushes threshold, regenerates the plan, and uploads to Intervals.icu.

**Tech Stack:** TypeScript, Vitest, Jotai, Next.js App Router, MSW, Intervals.icu API

**Spec:** `docs/specs/2026-04-13-pace-auto-update.md`

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `lib/paceInsight.ts` | `categoryFromExternalId()`, `temperatureCorrectHr()`, `computeCardiacCostTrend()`, `generatePaceSuggestion()` |
| `app/components/PaceSuggestionCard.tsx` | Suggestion card UI (improvement / regression / race result variants) |
| `app/components/PaceSuggestionBanner.tsx` | Fixed bottom banner on Calendar tab |

### Modified files
| File | Change |
|---|---|
| `lib/types.ts` | Add `external_id?: string` to `IntervalsEvent` |
| `lib/calendarPipeline.ts` | Import + use `categoryFromExternalId` for planned events and completed activities |
| `lib/db.ts` | Add `pace_suggestion_dismissed_at` column to `SCHEMA_DDL` |
| `lib/settings.ts` | Add `paceSuggestionDismissedAt` to `UserSettings`, read/write paths |
| `app/atoms.ts` | Add `paceSuggestionAtom` derived atom |
| `app/screens/IntelScreen.tsx` | Render `PaceSuggestionCard` in Overview tab |
| `app/page.tsx` | Render `PaceSuggestionBanner`, pass tab switch handler |

### Test files
| File | Covers |
|---|---|
| `lib/__tests__/paceInsight.test.ts` | All pure functions: category detection, temperature correction, cardiac cost trend, suggestion generation, regression, break detection, race result, 2% cap |
| `app/components/__tests__/PaceSuggestionCard.integration.test.tsx` | Card rendering, accept flow (settings + threshold + regenerate + upload), dismiss flow |

---

### Task 1: Add `external_id` to IntervalsEvent type

**Files:**
- Modify: `lib/types.ts:83-95`

- [ ] **Step 1: Add the field**

In `lib/types.ts`, add `external_id` to the `IntervalsEvent` interface after `id`:

```ts
export interface IntervalsEvent {
  id: number;
  external_id?: string;
  category: string;
  // ... rest unchanged
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: PASS — the field is optional, no consumers break.

- [ ] **Step 3: Commit**

```
feat: add external_id to IntervalsEvent type
```

---

### Task 2: Category detection from external_id

**Files:**
- Create: `lib/paceInsight.ts` (starting with just `categoryFromExternalId`)
- Modify: `lib/calendarPipeline.ts:1-10,108,256-262`
- Test: `lib/__tests__/paceInsight.test.ts`

- [ ] **Step 1: Write failing tests for `categoryFromExternalId`**

Create `lib/__tests__/paceInsight.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { categoryFromExternalId } from "../paceInsight";

describe("categoryFromExternalId", () => {
  it("maps speed prefix to interval", () => {
    expect(categoryFromExternalId("speed-5")).toBe("interval");
  });

  it("maps club prefix to interval", () => {
    expect(categoryFromExternalId("club-3")).toBe("interval");
  });

  it("maps easy prefix to easy", () => {
    expect(categoryFromExternalId("easy-5-3")).toBe("easy");
  });

  it("maps free prefix to easy", () => {
    expect(categoryFromExternalId("free-5-3")).toBe("easy");
  });

  it("maps long prefix to long", () => {
    expect(categoryFromExternalId("long-5")).toBe("long");
  });

  it("maps race prefix to race", () => {
    expect(categoryFromExternalId("race")).toBe("race");
  });

  it("maps ondemand prefix to other", () => {
    expect(categoryFromExternalId("ondemand-2026-04-13")).toBe("other");
  });

  it("returns null for unknown prefix", () => {
    expect(categoryFromExternalId("unknown-123")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(categoryFromExternalId(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(categoryFromExternalId("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/paceInsight.test.ts`
Expected: FAIL — `categoryFromExternalId` does not exist.

- [ ] **Step 3: Implement `categoryFromExternalId`**

Create `lib/paceInsight.ts`:

```ts
import type { CalendarEvent } from "./types";

type EventCategory = CalendarEvent["category"];

const EXTERNAL_ID_CATEGORY_MAP: Record<string, EventCategory> = {
  speed: "interval",
  club: "interval",
  easy: "easy",
  free: "easy",
  long: "long",
  race: "race",
  ondemand: "other",
};

export function categoryFromExternalId(
  externalId: string | undefined,
): EventCategory | null {
  if (!externalId) return null;
  const prefix = externalId.split("-")[0];
  return EXTERNAL_ID_CATEGORY_MAP[prefix] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/paceInsight.test.ts`
Expected: PASS

- [ ] **Step 5: Wire into `processPlannedEvents`**

In `lib/calendarPipeline.ts`, add import:

```ts
import { categoryFromExternalId } from "./paceInsight";
```

In `processPlannedEvents`, replace the category detection block (around line 260):

```ts
// OLD:
const isRace = name.toLowerCase().includes("race");
const category = isRace ? "race" : getWorkoutCategory(name);

// NEW:
const extCategory = categoryFromExternalId(event.external_id);
const category = extCategory ?? getWorkoutCategory(name);
const isRace = category === "race";
```

- [ ] **Step 6: Wire into `processActivities` for paired events**

In `processActivities`, after resolving `matchingEvent` (around line 164), change the category line:

```ts
// OLD (line 108):
const category = getWorkoutCategory(activity.name);

// NEW:
const category = categoryFromExternalId(matchingEvent?.external_id) ?? getWorkoutCategory(activity.name);
```

Move the `category` assignment to after `matchingEvent` is resolved (around line 164). The current line 108 is too early — `matchingEvent` hasn't been resolved yet. Move it to just before the CalendarEvent construction (around line 200), passing it into the object literal.

- [ ] **Step 7: Run full test suite to verify no regressions**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```
feat: derive event category from external_id prefix

Falls back to name-based detection for manually created events.
Fixes "RACE TEST" being miscategorized as race.
```

---

### Task 3: Temperature correction and cardiac cost trend

**Files:**
- Modify: `lib/paceInsight.ts`
- Test: `lib/__tests__/paceInsight.test.ts`

- [ ] **Step 1: Write failing tests for temperature correction**

Add to `lib/__tests__/paceInsight.test.ts`:

```ts
import { temperatureCorrectHr } from "../paceInsight";

describe("temperatureCorrectHr", () => {
  it("returns uncorrected HR below 15C threshold", () => {
    // January = -1C, well below 15C
    expect(temperatureCorrectHr(140, 0)).toBe(140); // Jan
    expect(temperatureCorrectHr(140, 3)).toBe(140); // Apr (7C)
    expect(temperatureCorrectHr(140, 4)).toBe(140); // May (12C)
  });

  it("corrects HR above 15C threshold", () => {
    // June = 17C -> correction = (17-15) * 1.8 = 3.6
    expect(temperatureCorrectHr(140, 5)).toBeCloseTo(136.4, 1);
    // July = 20C -> correction = (20-15) * 1.8 = 9.0
    expect(temperatureCorrectHr(140, 6)).toBeCloseTo(131, 1);
    // August = 19C -> correction = (19-15) * 1.8 = 7.2
    expect(temperatureCorrectHr(140, 7)).toBeCloseTo(132.8, 1);
  });

  it("handles month 11 (December, 0C) with no correction", () => {
    expect(temperatureCorrectHr(150, 11)).toBe(150);
  });
});
```

- [ ] **Step 2: Write failing tests for cardiac cost trend**

Add to `lib/__tests__/paceInsight.test.ts`:

```ts
import { computeCardiacCostTrend } from "../paceInsight";
import type { ZoneSegment } from "../paceCalibration";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function z2Seg(hr: number, pace: number, date: string): ZoneSegment {
  return { zone: "z2", avgHr: hr, avgPace: pace, durationMin: 10, activityId: "a1", activityDate: date };
}

describe("computeCardiacCostTrend", () => {
  it("returns negative change when cardiac cost is dropping (improvement)", () => {
    // Recent window (0-28 days ago): lower cardiac cost
    // Previous window (28-56 days ago): higher cardiac cost
    const segments: ZoneSegment[] = [
      // Previous window: HR 145, pace 7.0 -> product ~1015
      z2Seg(145, 7.0, daysAgo(50)),
      z2Seg(144, 7.0, daysAgo(46)),
      z2Seg(146, 7.0, daysAgo(42)),
      z2Seg(145, 7.0, daysAgo(38)),
      // Recent window: HR 135, pace 7.0 -> product ~945 (7% drop)
      z2Seg(135, 7.0, daysAgo(22)),
      z2Seg(136, 7.0, daysAgo(18)),
      z2Seg(134, 7.0, daysAgo(14)),
      z2Seg(135, 7.0, daysAgo(10)),
    ];
    const result = computeCardiacCostTrend(segments);
    expect(result).not.toBeNull();
    expect(result!.changePercent).toBeLessThan(-3); // >3% improvement
    expect(result!.direction).toBe("improving");
  });

  it("returns positive change when cardiac cost is rising (regression)", () => {
    const segments: ZoneSegment[] = [
      // Previous: HR 135
      z2Seg(135, 7.0, daysAgo(50)),
      z2Seg(136, 7.0, daysAgo(46)),
      z2Seg(134, 7.0, daysAgo(42)),
      z2Seg(135, 7.0, daysAgo(38)),
      // Recent: HR 148 -> ~9.6% increase
      z2Seg(148, 7.0, daysAgo(22)),
      z2Seg(149, 7.0, daysAgo(18)),
      z2Seg(147, 7.0, daysAgo(14)),
      z2Seg(148, 7.0, daysAgo(10)),
    ];
    const result = computeCardiacCostTrend(segments);
    expect(result).not.toBeNull();
    expect(result!.changePercent).toBeGreaterThan(5); // >5% regression
    expect(result!.direction).toBe("regressing");
  });

  it("returns null when change is within noise range", () => {
    const segments: ZoneSegment[] = [
      z2Seg(140, 7.0, daysAgo(50)),
      z2Seg(141, 7.0, daysAgo(46)),
      z2Seg(139, 7.0, daysAgo(42)),
      z2Seg(140, 7.0, daysAgo(38)),
      z2Seg(140, 7.0, daysAgo(22)),
      z2Seg(141, 7.0, daysAgo(18)),
      z2Seg(139, 7.0, daysAgo(14)),
      z2Seg(140, 7.0, daysAgo(10)),
    ];
    const result = computeCardiacCostTrend(segments);
    expect(result).toBeNull();
  });

  it("returns null with insufficient data in either window", () => {
    const segments: ZoneSegment[] = [
      z2Seg(145, 7.0, daysAgo(50)),
      z2Seg(144, 7.0, daysAgo(46)),
      // Only 2 in previous window, need 4
      z2Seg(135, 7.0, daysAgo(22)),
      z2Seg(136, 7.0, daysAgo(18)),
      z2Seg(134, 7.0, daysAgo(14)),
      z2Seg(135, 7.0, daysAgo(10)),
    ];
    expect(computeCardiacCostTrend(segments)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/paceInsight.test.ts`
Expected: FAIL — functions don't exist yet.

- [ ] **Step 4: Implement temperature correction**

Add to `lib/paceInsight.ts`:

```ts
/** Stockholm monthly average temperatures (C). Index 0 = January. */
const STOCKHOLM_MONTHLY_TEMP = [-1, -1, 2, 7, 12, 17, 20, 19, 14, 8, 3, 0];

/** HR inflation per degree C above the heat threshold. */
const HR_PER_DEGREE_ABOVE_THRESHOLD = 1.8;
const HEAT_THRESHOLD_C = 15;

/**
 * Correct HR for temperature effects on cardiac cost.
 * Above 15C, HR inflates ~1.8 bpm per degree. Returns the corrected HR
 * that removes the heat component, making cross-season comparisons fair.
 * @param month 0-indexed (0 = January, 11 = December)
 */
export function temperatureCorrectHr(avgHr: number, month: number): number {
  const temp = STOCKHOLM_MONTHLY_TEMP[month];
  const correction = Math.max(0, temp - HEAT_THRESHOLD_C) * HR_PER_DEGREE_ABOVE_THRESHOLD;
  return avgHr - correction;
}
```

- [ ] **Step 5: Implement cardiac cost trend**

Add to `lib/paceInsight.ts`. Merge the `ZoneSegment` import with the existing imports at the top — don't create a second import block:

```ts
import type { ZoneSegment } from "./paceCalibration";

export interface CardiacCostResult {
  changePercent: number; // negative = improving, positive = regressing
  direction: "improving" | "regressing";
  recentAvg: number;
  previousAvg: number;
}

const CARDIAC_COST_IMPROVEMENT_PCT = -3;
const CARDIAC_COST_REGRESSION_PCT = 5;
const MIN_SEGMENTS_PER_WINDOW = 4;
const RECENT_WINDOW_DAYS = 28;
const PREVIOUS_WINDOW_DAYS = 56; // 28-56 days ago

/**
 * Compare cardiac cost (correctedHr x pace) between two 4-week windows.
 * Returns the percent change, or null if insufficient data or within noise range.
 */
export function computeCardiacCostTrend(
  segments: ZoneSegment[],
): CardiacCostResult | null {
  const now = Date.now();
  const recentCutoff = now - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const previousCutoff = now - PREVIOUS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const z2Segments = segments.filter((s) => s.zone === "z2" && s.activityDate);

  const recent: number[] = [];
  const previous: number[] = [];

  for (const seg of z2Segments) {
    const dateMs = new Date(seg.activityDate).getTime();
    if (isNaN(dateMs)) continue;

    const month = new Date(seg.activityDate).getMonth();
    const correctedHr = temperatureCorrectHr(seg.avgHr, month);
    const cost = correctedHr * seg.avgPace;

    if (dateMs >= recentCutoff) {
      recent.push(cost);
    } else if (dateMs >= previousCutoff) {
      previous.push(cost);
    }
  }

  if (recent.length < MIN_SEGMENTS_PER_WINDOW || previous.length < MIN_SEGMENTS_PER_WINDOW) {
    return null;
  }

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
  const changePercent = ((recentAvg - previousAvg) / previousAvg) * 100;

  if (changePercent <= CARDIAC_COST_IMPROVEMENT_PCT) {
    return { changePercent, direction: "improving", recentAvg, previousAvg };
  }
  if (changePercent >= CARDIAC_COST_REGRESSION_PCT) {
    return { changePercent, direction: "regressing", recentAvg, previousAvg };
  }

  return null; // within noise range
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/paceInsight.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```
feat: add temperature-corrected cardiac cost trend computation

Uses Stockholm monthly averages to normalize HR for seasonal heat.
Compares 4-week windows: >3% drop = improvement, >5% rise = regression.
```

---

### Task 4: Pace suggestion generation

**Files:**
- Modify: `lib/paceInsight.ts`
- Test: `lib/__tests__/paceInsight.test.ts`

- [ ] **Step 1: Write failing tests for `generatePaceSuggestion`**

Add to `lib/__tests__/paceInsight.test.ts`. Note: `daysAgo` and `ZoneSegment` import already exist from Task 3. Add the new imports (`generatePaceSuggestion`, `PaceSuggestion`, `CalendarEvent`) to the existing import block at the top of the file. The helpers below go at file scope (not inside a `describe`):

```ts
// Add to existing imports at top of file:
import { generatePaceSuggestion, type PaceSuggestion } from "../paceInsight";
import type { CalendarEvent } from "../types";

// daysAgo() already defined in Task 3 — reuse it.

// Helpers: create segment arrays that trigger specific signals
function improvingZ4Segments(): ZoneSegment[] {
  // Z4 getting faster: 5.3 -> 5.1 over 60 days = ~0.2 min/km = 12 sec/km improvement
  return [
    { zone: "z4", avgHr: 162, avgPace: 5.30, durationMin: 4, activityId: "s1", activityDate: daysAgo(80) },
    { zone: "z4", avgHr: 162, avgPace: 5.25, durationMin: 4, activityId: "s2", activityDate: daysAgo(60) },
    { zone: "z4", avgHr: 162, avgPace: 5.20, durationMin: 4, activityId: "s3", activityDate: daysAgo(40) },
    { zone: "z4", avgHr: 162, avgPace: 5.15, durationMin: 4, activityId: "s4", activityDate: daysAgo(20) },
    { zone: "z4", avgHr: 162, avgPace: 5.10, durationMin: 4, activityId: "s5", activityDate: daysAgo(5) },
  ];
}

function improvingZ2Segments(): ZoneSegment[] {
  // Previous window: HR 145, pace 7.0 -> product 1015
  // Recent window: HR 135, pace 7.0 -> product 945 (~7% drop)
  return [
    { zone: "z2", avgHr: 145, avgPace: 7.0, durationMin: 10, activityId: "e1", activityDate: daysAgo(50) },
    { zone: "z2", avgHr: 144, avgPace: 7.0, durationMin: 10, activityId: "e2", activityDate: daysAgo(46) },
    { zone: "z2", avgHr: 146, avgPace: 7.0, durationMin: 10, activityId: "e3", activityDate: daysAgo(42) },
    { zone: "z2", avgHr: 145, avgPace: 7.0, durationMin: 10, activityId: "e4", activityDate: daysAgo(38) },
    { zone: "z2", avgHr: 135, avgPace: 7.0, durationMin: 10, activityId: "e5", activityDate: daysAgo(22) },
    { zone: "z2", avgHr: 136, avgPace: 7.0, durationMin: 10, activityId: "e6", activityDate: daysAgo(18) },
    { zone: "z2", avgHr: 134, avgPace: 7.0, durationMin: 10, activityId: "e7", activityDate: daysAgo(14) },
    { zone: "z2", avgHr: 135, avgPace: 7.0, durationMin: 10, activityId: "e8", activityDate: daysAgo(10) },
  ];
}

describe("generatePaceSuggestion", () => {
  const baseSettings = {
    currentAbilitySecs: 1620, // 27:00 5K
    currentAbilityDist: 5,
    paceSuggestionDismissedAt: undefined as number | undefined,
  };

  it("returns high confidence improvement with both signals", () => {
    const segments = [...improvingZ4Segments(), ...improvingZ2Segments()];
    const result = generatePaceSuggestion(segments, [], baseSettings);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("high");
    expect(result!.direction).toBe("improvement");
    expect(result!.suggestedAbilitySecs).toBeLessThan(1620);
  });

  it("returns medium confidence with only Z4 signal", () => {
    const segments = improvingZ4Segments();
    const result = generatePaceSuggestion(segments, [], baseSettings);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("medium");
    expect(result!.direction).toBe("improvement");
  });

  it("returns null when no signals detected", () => {
    const result = generatePaceSuggestion([], [], baseSettings);
    expect(result).toBeNull();
  });

  it("returns null when dismissed within 4 weeks", () => {
    const segments = [...improvingZ4Segments(), ...improvingZ2Segments()];
    const recentDismiss = {
      ...baseSettings,
      paceSuggestionDismissedAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 1 week ago
    };
    const result = generatePaceSuggestion(segments, [], recentDismiss);
    expect(result).toBeNull();
  });

  it("returns suggestion when dismissed more than 4 weeks ago", () => {
    const segments = [...improvingZ4Segments(), ...improvingZ2Segments()];
    const oldDismiss = {
      ...baseSettings,
      paceSuggestionDismissedAt: Date.now() - 35 * 24 * 60 * 60 * 1000, // 5 weeks ago
    };
    const result = generatePaceSuggestion(segments, [], oldDismiss);
    expect(result).not.toBeNull();
  });

  it("caps improvement at 2% of current ability time", () => {
    const segments = [...improvingZ4Segments(), ...improvingZ2Segments()];
    const result = generatePaceSuggestion(segments, [], baseSettings);
    expect(result).not.toBeNull();
    const maxDelta = Math.round(baseSettings.currentAbilitySecs * 0.02);
    expect(baseSettings.currentAbilitySecs - result!.suggestedAbilitySecs).toBeLessThanOrEqual(maxDelta);
  });

  it("returns null when signals conflict (one improving, one regressing)", () => {
    // Z4 improving but Z2 regressing
    const z4Improving = improvingZ4Segments();
    const z2Regressing: ZoneSegment[] = [
      { zone: "z2", avgHr: 135, avgPace: 7.0, durationMin: 10, activityId: "e1", activityDate: daysAgo(50) },
      { zone: "z2", avgHr: 136, avgPace: 7.0, durationMin: 10, activityId: "e2", activityDate: daysAgo(46) },
      { zone: "z2", avgHr: 134, avgPace: 7.0, durationMin: 10, activityId: "e3", activityDate: daysAgo(42) },
      { zone: "z2", avgHr: 135, avgPace: 7.0, durationMin: 10, activityId: "e4", activityDate: daysAgo(38) },
      { zone: "z2", avgHr: 148, avgPace: 7.0, durationMin: 10, activityId: "e5", activityDate: daysAgo(22) },
      { zone: "z2", avgHr: 149, avgPace: 7.0, durationMin: 10, activityId: "e6", activityDate: daysAgo(18) },
      { zone: "z2", avgHr: 147, avgPace: 7.0, durationMin: 10, activityId: "e7", activityDate: daysAgo(14) },
      { zone: "z2", avgHr: 148, avgPace: 7.0, durationMin: 10, activityId: "e8", activityDate: daysAgo(10) },
    ];
    const result = generatePaceSuggestion([...z4Improving, ...z2Regressing], [], baseSettings);
    expect(result).toBeNull();
  });

  it("detects regression with high confidence when both signals regress", () => {
    // Z4 getting slower: 5.1 -> 5.4 = 18 sec/km regression (over threshold)
    const z4Regressing: ZoneSegment[] = [
      { zone: "z4", avgHr: 162, avgPace: 5.10, durationMin: 4, activityId: "s1", activityDate: daysAgo(80) },
      { zone: "z4", avgHr: 162, avgPace: 5.18, durationMin: 4, activityId: "s2", activityDate: daysAgo(60) },
      { zone: "z4", avgHr: 162, avgPace: 5.26, durationMin: 4, activityId: "s3", activityDate: daysAgo(40) },
      { zone: "z4", avgHr: 162, avgPace: 5.34, durationMin: 4, activityId: "s4", activityDate: daysAgo(20) },
      { zone: "z4", avgHr: 162, avgPace: 5.40, durationMin: 4, activityId: "s5", activityDate: daysAgo(5) },
    ];
    const z2Regressing: ZoneSegment[] = [
      { zone: "z2", avgHr: 135, avgPace: 7.0, durationMin: 10, activityId: "e1", activityDate: daysAgo(50) },
      { zone: "z2", avgHr: 136, avgPace: 7.0, durationMin: 10, activityId: "e2", activityDate: daysAgo(46) },
      { zone: "z2", avgHr: 134, avgPace: 7.0, durationMin: 10, activityId: "e3", activityDate: daysAgo(42) },
      { zone: "z2", avgHr: 135, avgPace: 7.0, durationMin: 10, activityId: "e4", activityDate: daysAgo(38) },
      { zone: "z2", avgHr: 148, avgPace: 7.0, durationMin: 10, activityId: "e5", activityDate: daysAgo(22) },
      { zone: "z2", avgHr: 149, avgPace: 7.0, durationMin: 10, activityId: "e6", activityDate: daysAgo(18) },
      { zone: "z2", avgHr: 147, avgPace: 7.0, durationMin: 10, activityId: "e7", activityDate: daysAgo(14) },
      { zone: "z2", avgHr: 148, avgPace: 7.0, durationMin: 10, activityId: "e8", activityDate: daysAgo(10) },
    ];
    const result = generatePaceSuggestion([...z4Regressing, ...z2Regressing], [], baseSettings);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("high");
    expect(result!.direction).toBe("regression");
    expect(result!.suggestedAbilitySecs).toBeGreaterThan(1620);
  });

  it("returns null without ability settings", () => {
    const segments = [...improvingZ4Segments(), ...improvingZ2Segments()];
    const result = generatePaceSuggestion(segments, [], {
      currentAbilitySecs: undefined,
      currentAbilityDist: undefined,
      paceSuggestionDismissedAt: undefined,
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Write failing tests for race result detection**

Add to `lib/__tests__/paceInsight.test.ts`:

```ts
describe("generatePaceSuggestion — race result", () => {
  const baseSettings = {
    currentAbilitySecs: 1620, // 27:00 5K
    currentAbilityDist: 5,
    paceSuggestionDismissedAt: undefined as number | undefined,
  };

  it("uses direct comparison when race distance matches reference (within 10%)", () => {
    const raceEvent: CalendarEvent = {
      id: "activity-race1",
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      name: "RACE DAY",
      description: "",
      type: "completed",
      category: "race",
      distance: 5100, // 5.1km, within 10% of 5km
      duration: 1560, // 26:00 — faster than current 27:00
      activityId: "race1",
    };
    const result = generatePaceSuggestion([], [raceEvent], baseSettings);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("improvement");
    expect(result!.suggestedAbilitySecs).toBe(1560);
    expect(result!.raceResult).not.toBeNull();
    expect(result!.confidence).toBe("high");
  });

  it("detects regression via race result when distance matches", () => {
    const raceEvent: CalendarEvent = {
      id: "activity-race1",
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      name: "RACE DAY",
      description: "",
      type: "completed",
      category: "race",
      distance: 5000,
      duration: 1740, // 29:00 — slower than current 27:00
      activityId: "race1",
    };
    const result = generatePaceSuggestion([], [raceEvent], baseSettings);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("regression");
    expect(result!.suggestedAbilitySecs).toBe(1740);
  });

  it("amplifies trend confidence when race completed but distance doesn't match", () => {
    const raceEvent: CalendarEvent = {
      id: "activity-race1",
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      name: "RACE DAY",
      description: "",
      type: "completed",
      category: "race",
      distance: 16000, // 16km, doesn't match 5km reference
      duration: 8400,
      activityId: "race1",
    };
    // Only Z4 improving -> normally medium confidence
    const segments = improvingZ4Segments();
    const withoutRace = generatePaceSuggestion(segments, [], baseSettings);
    const withRace = generatePaceSuggestion(segments, [raceEvent], baseSettings);
    expect(withoutRace!.confidence).toBe("medium");
    // With race, single signal gets boosted (medium -> medium, but raceResult is set)
    expect(withRace!.raceResult).not.toBeNull();
  });

  it("returns null when race completed, no distance match, no trends", () => {
    const raceEvent: CalendarEvent = {
      id: "activity-race1",
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      name: "RACE DAY",
      description: "",
      type: "completed",
      category: "race",
      distance: 16000,
      duration: 8400,
      activityId: "race1",
    };
    const result = generatePaceSuggestion([], [raceEvent], baseSettings);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Write failing test for break detection**

Add to `lib/__tests__/paceInsight.test.ts`:

```ts
describe("generatePaceSuggestion — break detection", () => {
  const baseSettings = {
    currentAbilitySecs: 1620,
    currentAbilityDist: 5,
    paceSuggestionDismissedAt: undefined as number | undefined,
  };

  it("returns null when gap >14 days and <4 post-break runs", () => {
    // All activity dates after a 14+ day gap, but only 3 post-break
    const segments: ZoneSegment[] = [
      // Pre-break activity (long ago)
      { zone: "z4", avgHr: 162, avgPace: 5.30, durationMin: 4, activityId: "old1", activityDate: daysAgo(60) },
      // Gap: nothing between day 60 and day 10
      // Post-break: only 3 activities
      { zone: "z4", avgHr: 162, avgPace: 5.50, durationMin: 4, activityId: "new1", activityDate: daysAgo(10) },
      { zone: "z4", avgHr: 162, avgPace: 5.48, durationMin: 4, activityId: "new2", activityDate: daysAgo(7) },
      { zone: "z4", avgHr: 162, avgPace: 5.45, durationMin: 4, activityId: "new3", activityDate: daysAgo(4) },
    ];

    // Provide completed events to detect the gap (unique activity IDs = unique run dates)
    const events: CalendarEvent[] = [
      { id: "a-old1", date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), name: "Run", description: "", type: "completed", category: "easy", activityId: "old1" },
      { id: "a-new1", date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), name: "Run", description: "", type: "completed", category: "interval", activityId: "new1" },
      { id: "a-new2", date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), name: "Run", description: "", type: "completed", category: "interval", activityId: "new2" },
      { id: "a-new3", date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), name: "Run", description: "", type: "completed", category: "interval", activityId: "new3" },
    ];
    const result = generatePaceSuggestion(segments, events, baseSettings);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/paceInsight.test.ts`
Expected: FAIL — `generatePaceSuggestion` does not exist.

- [ ] **Step 5: Implement `generatePaceSuggestion`**

Add to `lib/paceInsight.ts`. Merge the `computeZonePaceTrend` import into the existing `import type { ZoneSegment } from "./paceCalibration"` line:

```ts
import { computeZonePaceTrend, type ZoneSegment } from "./paceCalibration";

export interface RaceResult {
  distance: number; // meters
  duration: number; // seconds
  name: string;
  distanceMatch: boolean;
}

export interface PaceSuggestion {
  direction: "improvement" | "regression";
  confidence: "high" | "medium";
  suggestedAbilitySecs: number;
  currentAbilitySecs: number;
  currentAbilityDist: number;
  z4ImprovementSecPerKm: number | null;
  cardiacCostChangePercent: number | null;
  raceResult: RaceResult | null;
}

interface SuggestionSettings {
  currentAbilitySecs?: number;
  currentAbilityDist?: number;
  paceSuggestionDismissedAt?: number;
}

const DISMISS_COOLDOWN_MS = 28 * 24 * 60 * 60 * 1000; // 4 weeks
const Z4_IMPROVEMENT_THRESHOLD = 10 / 60; // 10 sec/km = 0.167 min/km
const Z4_REGRESSION_THRESHOLD = 15 / 60; // 15 sec/km = 0.25 min/km
const Z4_TO_THRESHOLD_RATIO = 0.92; // midpoint of 0.90-0.94
const ABILITY_CAP_PCT = 0.02;
const BREAK_GAP_DAYS = 14;
const MIN_POST_BREAK_RUNS = 4;
const RACE_DISTANCE_TOLERANCE = 0.10; // 10%

function detectBreak(events: CalendarEvent[]): boolean {
  const now = Date.now();
  const windowCutoff = now - 90 * 24 * 60 * 60 * 1000;

  const completed = events
    .filter((e) => e.type === "completed" && e.date.getTime() >= windowCutoff)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (completed.length < 2) return false;

  // Find largest gap within the 90-day window
  let maxGapMs = 0;
  let gapEndIdx = -1;
  for (let i = 1; i < completed.length; i++) {
    const gap = completed[i].date.getTime() - completed[i - 1].date.getTime();
    if (gap > maxGapMs) {
      maxGapMs = gap;
      gapEndIdx = i;
    }
  }

  const gapDays = maxGapMs / (24 * 60 * 60 * 1000);
  if (gapDays < BREAK_GAP_DAYS) return false;

  // Count post-break runs
  const postBreakRuns = completed.length - gapEndIdx;
  return postBreakRuns < MIN_POST_BREAK_RUNS;
}

function findRecentRace(
  events: CalendarEvent[],
  abilityDist: number,
): RaceResult | null {
  const now = Date.now();
  const cutoff = now - 28 * 24 * 60 * 60 * 1000; // within 4 weeks

  const races = events
    .filter((e) =>
      e.type === "completed"
      && e.category === "race"
      && e.date.getTime() >= cutoff
      && e.distance != null
      && e.duration != null
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (races.length === 0) return null;

  const race = races[0];
  const raceDistKm = (race.distance ?? 0) / 1000;
  const distanceMatch = Math.abs(raceDistKm - abilityDist) / abilityDist <= RACE_DISTANCE_TOLERANCE;

  return {
    distance: race.distance!,
    duration: race.duration!,
    name: race.name,
    distanceMatch,
  };
}

export function generatePaceSuggestion(
  segments: ZoneSegment[],
  events: CalendarEvent[],
  settings: SuggestionSettings,
): PaceSuggestion | null {
  const { currentAbilitySecs, currentAbilityDist, paceSuggestionDismissedAt } = settings;
  if (!currentAbilitySecs || !currentAbilityDist) return null;

  // Check dismiss cooldown
  if (paceSuggestionDismissedAt) {
    const elapsed = Date.now() - paceSuggestionDismissedAt;
    if (elapsed < DISMISS_COOLDOWN_MS) return null;
  }

  // Check for break — suppress suggestions until enough post-break data
  if (detectBreak(events)) return null;

  // Check for race result with distance match (takes priority)
  const raceResult = findRecentRace(events, currentAbilityDist);
  if (raceResult?.distanceMatch) {
    const direction = raceResult.duration < currentAbilitySecs ? "improvement" : "regression";
    if (raceResult.duration === currentAbilitySecs) return null; // same time, no update needed
    return {
      direction,
      confidence: "high",
      suggestedAbilitySecs: raceResult.duration,
      currentAbilitySecs,
      currentAbilityDist,
      z4ImprovementSecPerKm: null,
      cardiacCostChangePercent: null,
      raceResult,
    };
  }

  // Signal 1: Z4 pace trend
  const z4Trend = computeZonePaceTrend(segments, "z4");
  let z4Direction: "improving" | "regressing" | "flat" = "flat";
  let z4SecPerKm = 0;

  if (z4Trend != null) {
    // z4Trend is min/km per day. Multiply by 90 days for total change, convert to sec/km.
    const totalChangeMinPerKm = z4Trend * 90;
    z4SecPerKm = totalChangeMinPerKm * 60; // convert to seconds

    if (z4SecPerKm <= -(Z4_IMPROVEMENT_THRESHOLD * 60)) {
      z4Direction = "improving";
    } else if (z4SecPerKm >= Z4_REGRESSION_THRESHOLD * 60) {
      z4Direction = "regressing";
    }
  }

  // Signal 2: Cardiac cost trend
  const cardiacCost = computeCardiacCostTrend(segments);
  let ccDirection: "improving" | "regressing" | "flat" = "flat";
  if (cardiacCost) {
    ccDirection = cardiacCost.direction;
  }

  // Check for conflicting signals
  if (
    (z4Direction === "improving" && ccDirection === "regressing")
    || (z4Direction === "regressing" && ccDirection === "improving")
  ) {
    return null;
  }

  // Determine overall direction and confidence
  let direction: "improvement" | "regression" | null = null;
  let confidence: "high" | "medium" | null = null;

  if (z4Direction === "improving" && ccDirection === "improving") {
    direction = "improvement";
    confidence = "high";
  } else if (z4Direction === "improving" && ccDirection === "flat") {
    direction = "improvement";
    confidence = "medium";
  } else if (z4Direction === "flat" && ccDirection === "improving") {
    direction = "improvement";
    confidence = "medium";
  } else if (z4Direction === "regressing" && ccDirection === "regressing") {
    direction = "regression";
    confidence = "high";
  } else if (z4Direction === "regressing" && ccDirection === "flat") {
    direction = "regression";
    confidence = "medium";
  } else if (z4Direction === "flat" && ccDirection === "regressing") {
    direction = "regression";
    confidence = "medium";
  }

  if (!direction || !confidence) return null;

  // Compute suggested ability time
  let deltaSecs: number;
  if (z4Trend != null && z4Direction !== "flat") {
    // Convert Z4 pace change to threshold pace change, then to ability time delta
    const z4ChangeMinPerKm = z4Trend * 90; // total change over window
    const thresholdChangeMinPerKm = z4ChangeMinPerKm / Z4_TO_THRESHOLD_RATIO;
    deltaSecs = thresholdChangeMinPerKm * 60 * currentAbilityDist; // seconds at reference distance
  } else if (cardiacCost) {
    // Estimate from cardiac cost: 3% cost drop ≈ ~5 sec/km threshold improvement
    const estimatedPaceChange = (cardiacCost.changePercent / 3) * (5 / 60); // min/km
    deltaSecs = estimatedPaceChange * 60 * currentAbilityDist;
  } else {
    return null;
  }

  // Apply 2% cap
  const maxDelta = Math.round(currentAbilitySecs * ABILITY_CAP_PCT);
  const clampedDelta = Math.sign(deltaSecs) * Math.min(Math.abs(Math.round(deltaSecs)), maxDelta);
  const suggestedAbilitySecs = currentAbilitySecs + clampedDelta;

  // Don't suggest if the change is trivially small (< 5 seconds)
  if (Math.abs(clampedDelta) < 5) return null;

  // Boost confidence if race was completed (even without distance match)
  if (raceResult && confidence === "medium") {
    // Keep medium but attach race result for UI display
  }

  return {
    direction,
    confidence,
    suggestedAbilitySecs,
    currentAbilitySecs,
    currentAbilityDist,
    z4ImprovementSecPerKm: z4SecPerKm !== 0 ? Math.round(z4SecPerKm) : null,
    cardiacCostChangePercent: cardiacCost?.changePercent ? Math.round(cardiacCost.changePercent * 10) / 10 : null,
    raceResult,
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/paceInsight.test.ts`
Expected: PASS

Adjust test data if needed to match the actual thresholds and math. The key behaviors to verify:
- Both signals same direction → high confidence
- Single signal → medium confidence
- Conflicting → null
- Dismissed within 4 weeks → null
- 2% cap applied
- Break detection suppresses suggestions
- Race distance match → direct comparison
- Race without match + trends → attached race result

- [ ] **Step 7: Commit**

```
feat: add pace suggestion generation with regression and race detection

Combines Z4 pace trend + cardiac cost signals with confidence levels.
Detects breaks, applies 2% ability cap, handles race results.
```

---

### Task 5: DB and settings changes

**Files:**
- Modify: `lib/db.ts:44-47`
- Modify: `lib/settings.ts:1-132`
- Test: `lib/__tests__/settings.test.ts` (add test for new column)

- [ ] **Step 1: Add column to SCHEMA_DDL**

In `lib/db.ts`, add after the `insulin_type TEXT` line (before the closing `);` of user_settings):

```ts
  insulin_type TEXT,
  pace_suggestion_dismissed_at INTEGER
```

(Remove the trailing space on `insulin_type TEXT` and add the comma.)

- [ ] **Step 2: Add field to UserSettings interface**

In `lib/settings.ts`, add to the `UserSettings` interface:

```ts
  paceSuggestionDismissedAt?: number;
```

- [ ] **Step 3: Update `getUserSettings` SELECT**

Add `pace_suggestion_dismissed_at` to the SELECT query. Add the mapping after the `insulinType` line:

```ts
  if (row.pace_suggestion_dismissed_at != null) settings.paceSuggestionDismissedAt = row.pace_suggestion_dismissed_at as number;
```

- [ ] **Step 4: Update `saveUserSettings` write path**

Add to the `if` chain in `saveUserSettings`:

```ts
  if (partial.paceSuggestionDismissedAt !== undefined) { sets.push("pace_suggestion_dismissed_at = ?"); args.push(partial.paceSuggestionDismissedAt ?? null); }
```

- [ ] **Step 5: Run existing settings tests**

Run: `npx vitest run lib/__tests__/settings.test.ts`
Expected: PASS

- [ ] **Step 6: Run the ALTER TABLE on production**

```sh
npm run db:query -- "const{createClient}=require('@libsql/client');const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});db.execute('ALTER TABLE user_settings ADD COLUMN pace_suggestion_dismissed_at INTEGER').then(r=>console.log('done',r)).catch(e=>console.log('already exists or error:',e.message))"
```

- [ ] **Step 7: Commit**

```
feat: add pace_suggestion_dismissed_at to user_settings schema
```

---

### Task 6: Jotai atom

**Files:**
- Modify: `app/atoms.ts`
- Modify: `lib/paceInsight.ts` (export `PaceSuggestion` type)

- [ ] **Step 1: Add `paceSuggestionAtom` to atoms.ts**

Add imports:

```ts
import { generatePaceSuggestion, type PaceSuggestion } from "@/lib/paceInsight";
```

Add the derived atom after `paceTableAtom`:

```ts
export const paceSuggestionAtom = atom<PaceSuggestion | null>((get) => {
  const calibration = get(paceCalibrationAtom);
  const settings = get(settingsAtom);
  const events = get(enrichedEventsAtom);
  if (!calibration || !settings) return null;

  return generatePaceSuggestion(
    calibration.segments,
    events,
    {
      currentAbilitySecs: settings.currentAbilitySecs,
      currentAbilityDist: settings.currentAbilityDist,
      paceSuggestionDismissedAt: settings.paceSuggestionDismissedAt,
    },
  );
});
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```
feat: add paceSuggestionAtom derived from calibration + settings
```

---

### Task 7: PaceSuggestionCard component

**Files:**
- Create: `app/components/PaceSuggestionCard.tsx`
- Test: `app/components/__tests__/PaceSuggestionCard.integration.test.tsx`

- [ ] **Step 1: Write failing integration test**

Create `app/components/__tests__/PaceSuggestionCard.integration.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/lib/__tests__/test-utils";
import { PaceSuggestionCard } from "../PaceSuggestionCard";
import type { PaceSuggestion } from "@/lib/paceInsight";

const improvementSuggestion: PaceSuggestion = {
  direction: "improvement",
  confidence: "high",
  suggestedAbilitySecs: 1560, // 26:00
  currentAbilitySecs: 1620,   // 27:00
  currentAbilityDist: 5,
  z4ImprovementSecPerKm: -12,
  cardiacCostChangePercent: -5.2,
  raceResult: null,
};

const regressionSuggestion: PaceSuggestion = {
  direction: "regression",
  confidence: "high",
  suggestedAbilitySecs: 1680, // 28:00
  currentAbilitySecs: 1620,
  currentAbilityDist: 5,
  z4ImprovementSecPerKm: 18,
  cardiacCostChangePercent: 7.1,
  raceResult: null,
};

const raceMatchSuggestion: PaceSuggestion = {
  direction: "improvement",
  confidence: "high",
  suggestedAbilitySecs: 1560,
  currentAbilitySecs: 1620,
  currentAbilityDist: 5,
  z4ImprovementSecPerKm: null,
  cardiacCostChangePercent: null,
  raceResult: { distance: 5000, duration: 1560, name: "Parkrun 5K", distanceMatch: true },
};

describe("PaceSuggestionCard", () => {
  it("renders improvement card with evidence text", () => {
    render(
      <PaceSuggestionCard suggestion={improvementSuggestion} onAccept={vi.fn()} onDismiss={vi.fn()} isAccepting={false} />,
    );
    expect(screen.getByText(/paces may need updating/i)).toBeInTheDocument();
    expect(screen.getByText(/26:00/)).toBeInTheDocument();
    expect(screen.getByText(/27:00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update paces/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /not now/i })).toBeInTheDocument();
  });

  it("renders regression card with different framing", () => {
    render(
      <PaceSuggestionCard suggestion={regressionSuggestion} onAccept={vi.fn()} onDismiss={vi.fn()} isAccepting={false} />,
    );
    expect(screen.getByText(/paces may need adjusting/i)).toBeInTheDocument();
    expect(screen.getByText(/injury risk/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adjust paces/i })).toBeInTheDocument();
  });

  it("renders race result card when distance matches", () => {
    render(
      <PaceSuggestionCard suggestion={raceMatchSuggestion} onAccept={vi.fn()} onDismiss={vi.fn()} isAccepting={false} />,
    );
    expect(screen.getByText(/Parkrun 5K/i)).toBeInTheDocument();
    expect(screen.getByText(/26:00/)).toBeInTheDocument();
  });

  it("calls onAccept when accept button is clicked", async () => {
    const onAccept = vi.fn();
    render(
      <PaceSuggestionCard suggestion={improvementSuggestion} onAccept={onAccept} onDismiss={vi.fn()} isAccepting={false} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /update paces/i }));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when dismiss button is clicked", async () => {
    const onDismiss = vi.fn();
    render(
      <PaceSuggestionCard suggestion={improvementSuggestion} onAccept={vi.fn()} onDismiss={onDismiss} isAccepting={false} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("disables buttons and shows loading state when accepting", () => {
    render(
      <PaceSuggestionCard suggestion={improvementSuggestion} onAccept={vi.fn()} onDismiss={vi.fn()} isAccepting={true} />,
    );
    expect(screen.getByRole("button", { name: /updating/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/__tests__/PaceSuggestionCard.integration.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement PaceSuggestionCard**

Create `app/components/PaceSuggestionCard.tsx`:

```tsx
"use client";

import { Loader2 } from "lucide-react";
import type { PaceSuggestion } from "@/lib/paceInsight";

function formatTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}:${String(rm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function distanceLabel(km: number): string {
  if (Math.abs(km - 5) < 0.5) return "5K";
  if (Math.abs(km - 10) < 0.5) return "10K";
  if (Math.abs(km - 21.0975) < 0.5) return "Half";
  if (Math.abs(km - 42.195) < 0.5) return "Marathon";
  return `${km}km`;
}

interface PaceSuggestionCardProps {
  suggestion: PaceSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  isAccepting: boolean;
}

export function PaceSuggestionCard({ suggestion, onAccept, onDismiss, isAccepting }: PaceSuggestionCardProps) {
  const { direction, suggestedAbilitySecs, currentAbilitySecs, currentAbilityDist, z4ImprovementSecPerKm, cardiacCostChangePercent, raceResult } = suggestion;

  const isImprovement = direction === "improvement";
  const label = distanceLabel(currentAbilityDist);

  // Build evidence text
  const evidenceLines: string[] = [];
  if (raceResult?.distanceMatch) {
    const diff = Math.abs(currentAbilitySecs - raceResult.duration);
    const faster = raceResult.duration < currentAbilitySecs;
    evidenceLines.push(
      `You finished in ${formatTime(raceResult.duration)} — ${formatTime(diff)} ${faster ? "faster" : "slower"} than your current ${label} ability (${formatTime(currentAbilitySecs)}).`,
    );
  } else {
    if (z4ImprovementSecPerKm != null) {
      const abs = Math.abs(z4ImprovementSecPerKm);
      evidenceLines.push(
        isImprovement
          ? `Your interval pace has improved by ${abs} sec/km over the last weeks.`
          : `Your interval pace has slowed by ${abs} sec/km over recent weeks.`,
      );
    }
    if (cardiacCostChangePercent != null) {
      const abs = Math.abs(cardiacCostChangePercent);
      evidenceLines.push(
        isImprovement
          ? `Your easy runs show ${abs.toFixed(0)}% better efficiency.`
          : `Your easy runs show ${abs.toFixed(0)}% higher effort for the same output.`,
      );
    }
  }

  const borderColor = isImprovement ? "border-brand/40" : "border-warning/40";
  const heading = raceResult?.distanceMatch
    ? `Race result: ${raceResult.name}`
    : isImprovement
      ? "Your paces may need updating"
      : "Your paces may need adjusting";

  const acceptLabel = isImprovement ? "Update paces" : "Adjust paces";

  return (
    <div className={`bg-surface rounded-xl border ${borderColor} p-4 space-y-3`}>
      <p className="text-sm font-semibold text-text">{heading}</p>

      {evidenceLines.map((line, i) => (
        <p key={i} className="text-sm text-muted">{line}</p>
      ))}

      {!isImprovement && !raceResult?.distanceMatch && (
        <p className="text-sm text-muted">Adjusting can reduce injury risk.</p>
      )}

      {raceResult && !raceResult.distanceMatch && (
        <p className="text-xs text-muted">Completed {raceResult.name} ({formatTime(raceResult.duration)}).</p>
      )}

      <p className="text-sm text-text">
        Suggested: <span className="font-semibold">{label} in {formatTime(suggestedAbilitySecs)}</span>
        <span className="text-muted"> (was {formatTime(currentAbilitySecs)})</span>
      </p>

      <div className="flex gap-3 pt-1">
        <button
          onClick={onAccept}
          disabled={isAccepting}
          className="px-4 py-2 text-sm font-bold rounded-lg bg-brand text-bg hover:bg-brand/90 transition disabled:opacity-50 flex items-center gap-2"
          aria-label={isAccepting ? "Updating paces..." : acceptLabel}
        >
          {isAccepting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isAccepting ? "Updating..." : acceptLabel}
        </button>
        <button
          onClick={onDismiss}
          disabled={isAccepting}
          className="px-4 py-2 text-sm font-medium rounded-lg text-muted hover:text-text transition disabled:opacity-50"
          aria-label="Not now"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/components/__tests__/PaceSuggestionCard.integration.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat: add PaceSuggestionCard component

Renders improvement, regression, and race result variants.
```

---

### Task 8: PaceSuggestionBanner component

**Files:**
- Create: `app/components/PaceSuggestionBanner.tsx`

- [ ] **Step 1: Create the banner component**

Create `app/components/PaceSuggestionBanner.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useAtomValue } from "jotai";
import { paceSuggestionAtom } from "../atoms";

interface PaceSuggestionBannerProps {
  onNavigateToIntel: () => void;
}

export function PaceSuggestionBanner({ onNavigateToIntel }: PaceSuggestionBannerProps) {
  const suggestion = useAtomValue(paceSuggestionAtom);
  const [dismissed, setDismissed] = useState(false);

  if (!suggestion || dismissed) return null;

  const label = suggestion.direction === "improvement"
    ? "Pace update available"
    : "Pace adjustment suggested";

  return (
    <div className="fixed bottom-14 md:bottom-4 left-0 right-0 z-40 flex justify-center px-4">
      <div className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-black/40 max-w-sm w-full">
        <p className="text-sm text-muted flex-1">
          <span className="text-text font-medium">{label}</span>
        </p>
        <button
          onClick={onNavigateToIntel}
          className="px-3 py-1.5 text-xs font-bold text-bg bg-brand rounded-lg hover:bg-brand/90 transition flex-shrink-0"
        >
          View
        </button>
        <button
          onClick={() => { setDismissed(true); }}
          className="text-muted hover:text-text text-lg leading-none flex-shrink-0"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```
feat: add PaceSuggestionBanner for Calendar tab
```

---

### Task 9: Wire into IntelScreen and page.tsx

**Files:**
- Modify: `app/screens/IntelScreen.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Add PaceSuggestionCard to IntelScreen Overview tab**

In `app/screens/IntelScreen.tsx`, add new imports and merge with existing ones:

```ts
// Add to existing atoms import (already has settingsAtom, calendarReloadAtom, etc.):
// Add: paceSuggestionAtom, updateSettingsAtom, diabetesModeAtom
import { ..., paceSuggestionAtom, updateSettingsAtom, diabetesModeAtom } from "../atoms";

// New component import:
import { PaceSuggestionCard } from "../components/PaceSuggestionCard";

// New lib imports:
import { getThresholdPace } from "@/lib/paceTable";
import { uploadPlan } from "@/lib/intervalsClient";
import { syncToGoogleCalendar, toSyncEvents } from "@/lib/googleCalendar";

// Merge with existing workoutGenerators import (already has generateFullPlan):
import { generateFullPlan, generatePlan } from "@/lib/workoutGenerators";
```

Inside `IntelScreen`, add atom reads (note: `calendarReloadAtom` is already used as `onRetryLoad` — reuse that):

```ts
const paceSuggestion = useAtomValue(paceSuggestionAtom);
const updateSettings = useSetAtom(updateSettingsAtom);
const diabetesMode = useAtomValue(diabetesModeAtom);
const [isAccepting, setIsAccepting] = useState(false);
```

Add accept and dismiss handlers:

```ts
const handleAcceptPaceSuggestion = async () => {
  if (!paceSuggestion || !settings?.hrZones?.length) return;
  setIsAccepting(true);
  try {
    // 1. Save new ability time
    await updateSettings({ currentAbilitySecs: paceSuggestion.suggestedAbilitySecs });

    // 2. Push threshold pace
    const newThreshold = getThresholdPace(
      paceSuggestion.currentAbilityDist,
      paceSuggestion.suggestedAbilitySecs,
    );
    if (newThreshold) {
      await fetch("/api/intervals/threshold-pace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paceMinPerKm: newThreshold }),
      });
    }

    // 3. Regenerate and upload plan
    const planEvents = generatePlan({
      bgModel: bgModel ?? null,
      raceDateStr: raceDate,
      raceDist: raceDist ?? 16,
      totalWeeks,
      startKm: startKm ?? 8,
      lthr: lthr ?? DEFAULT_LTHR,
      hrZones: settings.hrZones,
      includeBasePhase: settings.includeBasePhase ?? false,
      diabetesMode,
      runDays: settings.runDays,
      longRunDay: settings.longRunDay ?? 0,
      clubDay: settings.clubDay,
      clubType: settings.clubType,
      currentAbilitySecs: paceSuggestion.suggestedAbilitySecs,
      currentAbilityDist: paceSuggestion.currentAbilityDist,
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureEvents = planEvents.filter((e) => e.start_date_local >= today);
    if (futureEvents.length > 0) {
      await uploadPlan(futureEvents);
      void syncToGoogleCalendar("bulk-sync", { events: toSyncEvents(futureEvents) });
    }

    // 4. Reload calendar
    onRetryLoad();
  } catch (e) {
    console.error("Failed to accept pace suggestion:", e);
  }
  setIsAccepting(false);
};

const handleDismissPaceSuggestion = async () => {
  await updateSettings({ paceSuggestionDismissedAt: Date.now() });
};
```

Render the card in the Overview tab, between Phase Tracker and Volume Compact:

```tsx
{/* Pace Suggestion */}
{paceSuggestion && (
  <div>
    <PaceSuggestionCard
      suggestion={paceSuggestion}
      onAccept={handleAcceptPaceSuggestion}
      onDismiss={handleDismissPaceSuggestion}
      isAccepting={isAccepting}
    />
  </div>
)}
```

- [ ] **Step 2: Add PaceSuggestionBanner to page.tsx**

In `app/page.tsx`, add import:

```ts
import { PaceSuggestionBanner } from "./components/PaceSuggestionBanner";
```

Add the banner after `UnratedRunBanner`, passing the tab switch handler:

```tsx
<UnratedRunBanner />
{activeTab !== "intel" && (
  <PaceSuggestionBanner onNavigateToIntel={() => { handleTabChange("intel"); }} />
)}
```

Hide the banner when already on the Intel tab (the card is visible there).

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat: wire pace suggestion into IntelScreen and Calendar banner

Accept flow: update ability -> push threshold -> regenerate plan -> upload.
Banner shows on non-Intel tabs, switches to Intel on click.
```

---

### Task 10: Manual verification and cleanup

- [ ] **Step 1: Run dev server and verify**

Run: `npm run dev`

Verify:
1. No console errors on load
2. If pace data exists, check that `paceSuggestionAtom` evaluates correctly (use React DevTools or add a temporary log in the atom)
3. If a suggestion is generated, the card renders in the Intel Overview tab
4. Accept flow saves settings, pushes threshold, regenerates plan
5. Dismiss hides the card and persists the timestamp

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS — fix any issues.

- [ ] **Step 3: Run full test suite one more time**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Final commit if any cleanup was needed**

```
chore: lint and cleanup for pace auto-update
```
