# Tomorrow Card startBG Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Tomorrow card from using current BG as a matching predictor for tomorrow's run; freeze its match set across CGM ticks; remove all live-BG framing from the card.

**Architecture:** Make `MatchTarget.startBG` nullable (consistent with `fuelRate`); `findMatchingRuns` short-circuits the BG window to "always pass" when target startBG is null and drops `"startBG"` from the returned `usedPredictors` so the UI doesn't lie. Walk the change up the stack: `intelScreenData.buildTomorrow` passes `startBG: null` and stops accepting `currentBG`; `TomorrowCard` drops the `currentBG`/`currentBGSource` props and rewrites the ribbon label to category-based; `IntelScreen` drops the `currentBGAtom` subscription so the screen stops re-rendering on every CGM tick.

**Tech Stack:** TypeScript · Vitest · React Testing Library · Jotai

**Spec:** `docs/specs/2026-05-11-tomorrow-card-startbg-fix.md`

**Project rules note:** Per project CLAUDE.md, commits require explicit user consent ("commit", "cp"). The "Commit" steps below show the message to use, but never run without explicit go-ahead per task.

---

## File Structure

**Modified:**
- `lib/matchingRuns.ts` — `MatchTarget.startBG: number | null`; `inWindow` skip; `findMatchingRuns` filter `usedPredictors`.
- `lib/intelScreenData.ts` — `buildTomorrow` passes `startBG: null`; drop `FALLBACK_START_BG`, `currentBG`/`currentBGSource` from `TomorrowData`; drop `currentBG` param from `buildTomorrowData` and `buildIntelScreenData`.
- `app/components/TomorrowCard.tsx` — drop `currentBG`/`currentBGSource` props; drop `FALLBACK_START_BG`/`liveBG`/`ribbonStartBG`/`bgMeta`; rewrite header line and ribbon label.
- `app/screens/IntelScreen.tsx` — drop `currentBGAtom` import + subscription; drop `currentBG` arg + dependency from `useMemo` for `buildTomorrowData`.

**Test files modified:**
- `lib/__tests__/matchingRuns.test.ts` — two new tests for null startBG.
- `lib/__tests__/intelScreenData.test.ts` — drop currentBG/Source assertions; new stability test; delete the "fallback" test.
- `app/components/__tests__/TomorrowCard.integration.test.tsx` — drop fixture fields; new ribbon-label tests; delete the "fallback BG label" test.

---

### Task 1: Allow null `startBG` in `MatchTarget`

**Files:**
- Modify: `lib/matchingRuns.ts`
- Test: `lib/__tests__/matchingRuns.test.ts`

- [ ] **Step 1: Write the failing tests**

Add at the bottom of the existing `describe("findMatchingRuns", ...)` block in `lib/__tests__/matchingRuns.test.ts`:

```ts
  it("treats target.startBG === null as 'skip startBG filter'", () => {
    // 12 runs spread across BG values that would normally fail the ±2.0 startBG window.
    // With startBG=null in target, all category runs survive that filter.
    const history = Array.from({ length: 12 }, (_, i) =>
      mk({
        category: "interval",
        date: `2026-04-${String(i + 1).padStart(2, "0")}`,
        activityId: `s${i}`,
        startBG: 5 + i * 0.7, // 5.0 .. 12.7 — far outside any single ±2.0 window
        fuelRate: 60,
        hourOfDay: 7,
      }),
    );
    const result = findMatchingRuns({ ...target, startBG: null }, history);
    // All 12 are in category, all match fuelRate/timeOfDay; cap is 10 most recent.
    expect(result.matches.length).toBe(10);
  });

  it("omits 'startBG' from usedPredictors when target.startBG is null", () => {
    // Same 12-run setup as above so startBG would normally rank as a predictor.
    const history = Array.from({ length: 12 }, (_, i) =>
      mk({
        category: "interval",
        date: `2026-04-${String(i + 1).padStart(2, "0")}`,
        activityId: `s${i}`,
        startBG: 5 + i * 0.7,
        fuelRate: 60,
        hourOfDay: 7,
        wentHypo: i % 2 === 0,
      }),
    );
    const result = findMatchingRuns({ ...target, startBG: null }, history);
    expect(result.usedPredictors).not.toContain("startBG");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/__tests__/matchingRuns.test.ts`
Expected: the two new tests FAIL — TypeScript will error on `startBG: null` in the target literal because `MatchTarget.startBG` is currently `number`.

- [ ] **Step 3: Make `MatchTarget.startBG` nullable**

Edit `lib/matchingRuns.ts`:

```ts
export interface MatchTarget {
  category: WorkoutCategory;
  startBG: number | null;
  fuelRate: number | null;
  hourOfDay: number;
  entrySlope?: number | null;
}
```

- [ ] **Step 4: Update `inWindow` to skip the BG filter when target is null**

In `lib/matchingRuns.ts`, replace the `case "startBG":` arm of `inWindow`:

```ts
    case "startBG":
      if (target.startBG == null) return true;
      return Math.abs(run.startBG - target.startBG) <= window;
```

- [ ] **Step 5: Drop `"startBG"` from `usedPredictors` when target.startBG is null**

In `lib/matchingRuns.ts`, replace this block inside `findMatchingRuns`:

```ts
  let usedPredictors: PredictorName[] = ranked.map((p) => p.predictor);
  const startedWithPredictors = usedPredictors.length > 0;
```

with:

```ts
  let usedPredictors: PredictorName[] = ranked
    .map((p) => p.predictor)
    .filter((p) => !(p === "startBG" && target.startBG == null));
  const startedWithPredictors = usedPredictors.length > 0;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/matchingRuns.test.ts`
Expected: all `findMatchingRuns` tests PASS, including the two new ones.

- [ ] **Step 7: Run typecheck across the repo to confirm no callers break**

Run: `npx tsc --noEmit`
Expected: no errors. (`MatchTarget.startBG` widening from `number` to `number | null` is non-breaking for existing callers.)

- [ ] **Step 8: Commit**

```bash
git add lib/matchingRuns.ts lib/__tests__/matchingRuns.test.ts
git commit -m "fix(matching): allow null startBG; skip BG window and predictor label when null"
```

---

### Task 2: Pipe `startBG: null` through `buildTomorrow`

**Files:**
- Modify: `lib/intelScreenData.ts`
- Test: `lib/__tests__/intelScreenData.test.ts`

This is the smallest behavioral change that fixes the bug end-to-end: the matcher stops keying off currentBG, so the match set is stable across CGM ticks. We keep `currentBG`/`currentBGSource` on `TomorrowData` for now — Task 4 removes those fields once the UI no longer reads them.

- [ ] **Step 1: Write the failing test**

Add inside `describe("buildIntelScreenData", ...)` in `lib/__tests__/intelScreenData.test.ts`:

```ts
  it("returns identical tomorrow data for two different currentBG values", () => {
    // 12 easy runs with varied start BG so the matcher would pick different
    // sets if startBG were a filter. After this fix, both calls collapse to
    // the same match set.
    const activities: CachedActivity[] = Array.from({ length: 12 }, (_, i) =>
      makeActivity({
        activityId: `e${i}`,
        category: "easy",
        activityDate: `2026-04-${String(i + 1).padStart(2, "0")}`,
        runStartMs: new Date(`2026-04-${String(i + 1).padStart(2, "0")}T07:00:00Z`).getTime(),
        glucose: [
          { time: 0, value: 5 + i * 0.5 }, // 5.0 .. 10.5
          { time: 60, value: 4 + i * 0.4 },
        ],
        runBGContext: {
          activityId: `e${i}`,
          category: "easy",
          pre: { startBG: 5 + i * 0.5, entrySlope30m: 0, entryStability: 0.5, readingCount: 6 },
          post: {
            endBG: 4 + i * 0.4,
            recoveryDrop30m: 0,
            nadirPostRun: 4 + i * 0.4,
            timeToStable: 30,
            postRunHypo: false,
            readingCount: 6,
            peak30m: 5 + i * 0.5,
            spike30m: 0.5,
            peak60mAboveEnd: 1.0,
          },
          totalBGImpact: -1,
        },
      }),
    );
    const events: CalendarEvent[] = [
      {
        id: "future",
        date: new Date("2026-04-15T07:00:00Z"),
        name: "W02 Easy",
        description: "",
        type: "planned",
        category: "easy",
        distance: 6000,
        duration: 2100,
      },
    ];

    const a = buildIntelScreenData(activities, events, {}, 5.9, new Date("2026-04-14T15:00:00Z"));
    const b = buildIntelScreenData(activities, events, {}, 6.1, new Date("2026-04-14T15:00:00Z"));

    expect(a.tomorrow?.matches).toEqual(b.tomorrow?.matches);
    expect(a.tomorrow?.prediction).toEqual(b.tomorrow?.prediction);
    expect(a.tomorrow?.recommendation).toEqual(b.tomorrow?.recommendation);
    expect(a.tomorrow?.matchPredictors).toEqual(b.tomorrow?.matchPredictors);
    expect(a.tomorrow?.matchPredictors).not.toContain("startBG");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/__tests__/intelScreenData.test.ts -t "identical tomorrow data"`
Expected: FAIL — currently the two builds key off currentBG and produce different match sets / `matchPredictors` includes `startBG`.

- [ ] **Step 3: Update `buildTomorrow` to pass `startBG: null`**

In `lib/intelScreenData.ts`, replace this block inside `buildTomorrow`:

```ts
  const currentBGSource: TomorrowData["currentBGSource"] = currentBG == null ? "fallback" : "live";
  const startBG = currentBG ?? FALLBACK_START_BG;
  const fuelRate = next.fuelRate ?? DEFAULT_FUEL_RATE;
  const hourOfDay = next.date.getHours();

  const target: MatchTarget = {
    category,
    startBG,
    fuelRate,
    hourOfDay,
    entrySlope: null,
  };
```

with:

```ts
  const currentBGSource: TomorrowData["currentBGSource"] = currentBG == null ? "fallback" : "live";
  const fuelRate = next.fuelRate ?? DEFAULT_FUEL_RATE;
  const hourOfDay = next.date.getHours();

  const target: MatchTarget = {
    category,
    startBG: null,
    fuelRate,
    hourOfDay,
    entrySlope: null,
  };
```

(`currentBGSource` is preserved for now so `TomorrowData`'s existing field stays populated. Task 4 removes both.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/__tests__/intelScreenData.test.ts -t "identical tomorrow data"`
Expected: PASS.

- [ ] **Step 5: Run the full intelScreenData test file**

Run: `npm test -- lib/__tests__/intelScreenData.test.ts`
Expected: all tests PASS. (The existing `flags currentBGSource as fallback…` test still passes because we kept that field for now.)

- [ ] **Step 6: Commit**

```bash
git add lib/intelScreenData.ts lib/__tests__/intelScreenData.test.ts
git commit -m "fix(tomorrow): pass startBG=null to matcher; freeze match set across CGM ticks"
```

---

### Task 3: Drop `currentBG`/`currentBGSource` from `TomorrowCard`

**Files:**
- Modify: `app/components/TomorrowCard.tsx`
- Test: `app/components/__tests__/TomorrowCard.integration.test.tsx`

This commit removes the live-BG framing from the card — header line, ribbon label, all related derivations and constants. The card's `Props` type narrows; `IntelScreen` continues to spread the (now-extra) `currentBG`/`currentBGSource` from `TomorrowData` — TypeScript permits excess properties via JSX spread, so the build stays green. Task 4 cleans up the data shape.

- [ ] **Step 1: Update the test fixture and existing assertions**

In `app/components/__tests__/TomorrowCard.integration.test.tsx`, replace the `sample` constant:

```ts
const sample = {
  workout: {
    name: "W14 Long Intervals — 4×6min",
    date: "2026-05-11",
    timeOfDay: "06:30",
    category: "interval" as const,
    durationMin: 50,
    distanceKm: 7,
    targetHRRange: "152-158 bpm",
  },
  recommendation: {
    fuelRate: 60,
    basis: "evidence" as const,
    predictedP10EndBG: 4.4,
    matchCountAtRate: 8,
  },
  prediction: {
    during: {
      medianEndBG: 5.8,
      p10EndBG: 4.4,
      p90EndBG: 6.6,
      hypoCount: 2,
      matchCount: 8,
      confidence: "medium" as const,
    },
    after: {
      medianRebound: 3.0,
      p10Rebound: 0.5,
      p90Rebound: 5.8,
      medianPeakBG: 8.8,
      p10PeakBG: 6.3,
      p90PeakBG: 11.6,
      lateHypoCount: 1,
      bigReboundCount: 8,
      matchCount: 11,
    },
  },
  matches: [
    { activityId: "x1", date: "2026-04-30", startBG: 8.6, endBG: 4.8, fuelRate: 60 },
    { activityId: "x2", date: "2026-04-23", startBG: 11.7, endBG: 9.1, fuelRate: 60 },
  ],
  matchPredictors: ["fuelRate"] as PredictorName[],
  matchRelaxed: false,
};
```

(Drops `currentBG: 8.5 as number | null` and `currentBGSource: "live" as const`. Drops `"startBG"` from `matchPredictors` to reflect the post-fix world.)

- [ ] **Step 2: Update the predictor explainer test**

Replace this test:

```ts
  it("shows matching predictor explainer when predictors are used", () => {
    render(
      <TomorrowCard {...sample} matchPredictors={["startBG", "fuelRate"]} matchRelaxed={false} />,
    );
    expect(screen.getByText(/Matched on similar starting BG and fuel rate/i)).toBeInTheDocument();
  });
```

with:

```ts
  it("shows matching predictor explainer when predictors are used", () => {
    render(
      <TomorrowCard {...sample} matchPredictors={["fuelRate", "timeOfDay"]} matchRelaxed={false} />,
    );
    expect(screen.getByText(/Matched on similar fuel rate and time of day/i)).toBeInTheDocument();
  });
```

- [ ] **Step 3: Add the new ribbon-label tests**

Add at the bottom of the `describe("TomorrowCard", ...)` block:

```ts
  it("ribbon label names the typical category and recommended fuel rate", () => {
    render(<TomorrowCard {...sample} />);
    expect(
      screen.getByText(/Predicted end BG · typical Interval at 60 g\/h/i),
    ).toBeInTheDocument();
  });

  it("ribbon label drops the fuel-rate suffix when no recommendation exists", () => {
    render(<TomorrowCard {...sample} recommendation={null} />);
    expect(
      screen.getByText(/Predicted end BG · typical Interval$/i),
    ).toBeInTheDocument();
  });

  it("does not render any 'current BG' or 'starting at' framing", () => {
    render(<TomorrowCard {...sample} />);
    expect(screen.queryByText(/current BG/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/starting at/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no live BG/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 4: Delete the "fallback BG label" test**

Delete this test entirely (lines 119–123 of the original file):

```ts
  it("renders fallback BG label when no live reading is available", () => {
    render(<TomorrowCard {...sample} currentBG={null} currentBGSource="fallback" />);
    expect(screen.getByText(/no live BG/i)).toBeInTheDocument();
    expect(screen.getByText(/typical 8\.0 mmol\/L start/i)).toBeInTheDocument();
  });
```

- [ ] **Step 5: Run the test file to verify failures**

Run: `npm test -- app/components/__tests__/TomorrowCard.integration.test.tsx`
Expected: the three new ribbon/framing tests FAIL (TomorrowCard still renders `current BG` / `starting at`); existing tests may also FAIL because of the fixture change.

- [ ] **Step 6: Drop `currentBG`/`currentBGSource` from `Props` and remove derivations**

In `app/components/TomorrowCard.tsx`, replace the `Props` interface:

```ts
interface Props {
  workout: TomorrowWorkoutSummary;
  recommendation: FuelRecommendation | null;
  prediction: PredictedOutcome | null;
  matches: TomorrowMatchSummary[];
  matchPredictors: PredictorName[];
  matchRelaxed: boolean;
}
```

Delete the `FALLBACK_START_BG` constant near the top of the file:

```ts
const FALLBACK_START_BG = 8.0;
```

Update the function signature destructuring (replace the existing destructure):

```ts
export function TomorrowCard({
  workout,
  recommendation,
  prediction,
  matches,
  matchPredictors,
  matchRelaxed,
}: Props) {
```

Delete these three lines from the body:

```ts
  const liveBG = currentBGSource === "live" && currentBG != null ? currentBG : null;
  const ribbonStartBG = liveBG ?? FALLBACK_START_BG;
  const bgMeta =
    liveBG == null
      ? `no live BG · matching against typical ${FALLBACK_START_BG.toFixed(1)} mmol/L start`
      : `current BG ${liveBG.toFixed(1)}`;
```

- [ ] **Step 7: Update the header line**

In `app/components/TomorrowCard.tsx`, replace:

```tsx
      <div className="text-xs text-muted">
        ~{workout.durationMin} min · {workout.distanceKm} km · target HR {workout.targetHRRange} · {bgMeta}
      </div>
```

with:

```tsx
      <div className="text-xs text-muted">
        ~{workout.durationMin} min · {workout.distanceKm} km · target HR {workout.targetHRRange}
      </div>
```

- [ ] **Step 8: Update the during-phase ribbon label**

In `app/components/TomorrowCard.tsx`, replace this block:

```tsx
            <Ribbon
              label={`Predicted end BG · starting at ${ribbonStartBG.toFixed(1)}`}
              p10={prediction.during.p10EndBG}
              median={prediction.during.medianEndBG}
              p90={prediction.during.p90EndBG}
              variant="during"
            />
```

with:

```tsx
            <Ribbon
              label={
                recommendation
                  ? `Predicted end BG · typical ${WORKOUT_CATEGORY_LABEL[workout.category]} at ${recommendation.fuelRate} g/h`
                  : `Predicted end BG · typical ${WORKOUT_CATEGORY_LABEL[workout.category]}`
              }
              p10={prediction.during.p10EndBG}
              median={prediction.during.medianEndBG}
              p90={prediction.during.p90EndBG}
              variant="during"
            />
```

- [ ] **Step 9: Run the test file to verify it passes**

Run: `npm test -- app/components/__tests__/TomorrowCard.integration.test.tsx`
Expected: all tests PASS.

- [ ] **Step 10: Run typecheck across the repo**

Run: `npx tsc --noEmit`
Expected: no errors. (IntelScreen still spreads `currentBG`/`currentBGSource` from `intelData.tomorrow` into TomorrowCard — JSX spreads accept excess props without erroring. Task 4 cleans that up.)

- [ ] **Step 11: Commit**

```bash
git add app/components/TomorrowCard.tsx app/components/__tests__/TomorrowCard.integration.test.tsx
git commit -m "fix(tomorrow): drop live-BG props and framing from card; rename ribbon label"
```

---

### Task 4: Drop `currentBG` plumbing from `intelScreenData` and `IntelScreen`

**Files:**
- Modify: `lib/intelScreenData.ts`
- Modify: `app/screens/IntelScreen.tsx`
- Test: `lib/__tests__/intelScreenData.test.ts`

- [ ] **Step 1: Update existing intelScreenData tests to drop currentBG/Source**

In `lib/__tests__/intelScreenData.test.ts`, in the `returns shape with all four sections present` test:

Replace this call:

```ts
    const result = buildIntelScreenData(activities, events, settings, 7.5, new Date("2026-04-07T12:00:00Z"));
```

with:

```ts
    const result = buildIntelScreenData(activities, events, settings, new Date("2026-04-07T12:00:00Z"));
```

Delete these two assertions:

```ts
    expect(result.tomorrow?.currentBG).toBe(7.5);
    expect(result.tomorrow?.currentBGSource).toBe("live");
```

In the `returns null tomorrow when no future planned events` test, replace:

```ts
    const result = buildIntelScreenData([], [], {}, null, new Date("2026-04-01T00:00:00Z"));
```

with:

```ts
    const result = buildIntelScreenData([], [], {}, new Date("2026-04-01T00:00:00Z"));
```

Delete the entire `flags currentBGSource as fallback…` test (the last `it(...)` in the file).

In the `returns identical tomorrow data for two different currentBG values` test added in Task 2, replace it with:

```ts
  it("tomorrow data does not depend on a currentBG input (signature-level)", () => {
    // After dropping currentBG from the signature, building twice with the same
    // inputs is trivially equal. This test exists to lock in the signature
    // contract: no currentBG arg, and no currentBG/currentBGSource on the result.
    const activities: CachedActivity[] = Array.from({ length: 12 }, (_, i) =>
      makeActivity({
        activityId: `e${i}`,
        category: "easy",
        activityDate: `2026-04-${String(i + 1).padStart(2, "0")}`,
        runStartMs: new Date(`2026-04-${String(i + 1).padStart(2, "0")}T07:00:00Z`).getTime(),
        glucose: [
          { time: 0, value: 5 + i * 0.5 },
          { time: 60, value: 4 + i * 0.4 },
        ],
        runBGContext: {
          activityId: `e${i}`,
          category: "easy",
          pre: { startBG: 5 + i * 0.5, entrySlope30m: 0, entryStability: 0.5, readingCount: 6 },
          post: {
            endBG: 4 + i * 0.4,
            recoveryDrop30m: 0,
            nadirPostRun: 4 + i * 0.4,
            timeToStable: 30,
            postRunHypo: false,
            readingCount: 6,
            peak30m: 5 + i * 0.5,
            spike30m: 0.5,
            peak60mAboveEnd: 1.0,
          },
          totalBGImpact: -1,
        },
      }),
    );
    const events: CalendarEvent[] = [
      {
        id: "future",
        date: new Date("2026-04-15T07:00:00Z"),
        name: "W02 Easy",
        description: "",
        type: "planned",
        category: "easy",
        distance: 6000,
        duration: 2100,
      },
    ];

    const a = buildTomorrowData(activities, events, {}, new Date("2026-04-14T15:00:00Z"));
    const b = buildTomorrowData(activities, events, {}, new Date("2026-04-14T15:00:00Z"));

    expect(a).toEqual(b);
    expect(a?.matchPredictors).not.toContain("startBG");
    expect(a).not.toHaveProperty("currentBG");
    expect(a).not.toHaveProperty("currentBGSource");
  });
```

- [ ] **Step 2: Run the test file to verify failures**

Run: `npm test -- lib/__tests__/intelScreenData.test.ts`
Expected: TypeScript errors plus failing assertions — `buildIntelScreenData`/`buildTomorrowData` still require the `currentBG` arg, and `TomorrowData` still has `currentBG`/`currentBGSource`.

- [ ] **Step 3: Drop the fields from `TomorrowData`**

In `lib/intelScreenData.ts`, replace the `TomorrowData` interface:

```ts
export interface TomorrowData {
  workout: TomorrowWorkoutSummary;
  recommendation: FuelRecommendation | null;
  prediction: PredictedOutcome | null;
  matches: TomorrowMatchSummary[];
  matchPredictors: PredictorName[];
  matchRelaxed: boolean;
}
```

- [ ] **Step 4: Drop the `FALLBACK_START_BG` constant**

In `lib/intelScreenData.ts`, delete this line near the top:

```ts
const FALLBACK_START_BG = 8.0;
```

- [ ] **Step 5: Drop `currentBG` from `buildTomorrow`**

In `lib/intelScreenData.ts`, replace the `buildTomorrow` signature:

```ts
function buildTomorrow(
  activities: CachedActivity[],
  events: CalendarEvent[],
  settings: UserSettings,
  reference: Date,
): TomorrowData | null {
```

Inside the body, delete this line:

```ts
  const currentBGSource: TomorrowData["currentBGSource"] = currentBG == null ? "fallback" : "live";
```

Replace the `return` statement at the bottom of `buildTomorrow`:

```ts
  return {
    workout: {
      name: next.name,
      date: dateISO,
      timeOfDay,
      category,
      durationMin,
      distanceKm,
      targetHRRange,
    },
    recommendation,
    prediction,
    matches: matchesSummary,
    matchPredictors: usedPredictors,
    matchRelaxed: relaxed,
  };
```

- [ ] **Step 6: Drop `currentBG` from the public entry points**

In `lib/intelScreenData.ts`, replace `buildTomorrowData`:

```ts
export function buildTomorrowData(
  activities: CachedActivity[],
  events: CalendarEvent[],
  settings: UserSettings,
  reference: Date = new Date(),
): TomorrowData | null {
  return buildTomorrow(activities, events, settings, reference);
}
```

Replace `buildIntelScreenData`:

```ts
export function buildIntelScreenData(
  activities: CachedActivity[],
  events: CalendarEvent[],
  settings: UserSettings,
  reference: Date = new Date(),
): IntelScreenData {
  return {
    ...buildHistoryData(activities, events, settings),
    tomorrow: buildTomorrowData(activities, events, settings, reference),
  };
}
```

- [ ] **Step 7: Drop the `currentBGAtom` subscription from IntelScreen**

In `app/screens/IntelScreen.tsx`, in the `import { ... } from "../atoms";` block, remove the line `currentBGAtom,`.

Delete this line (currently at line 198):

```ts
  const currentBG = useAtomValue(currentBGAtom);
```

Replace the `tomorrowData` `useMemo` block:

```ts
  // Tomorrow no longer depends on live BG — recomputes only when activities,
  // events, or settings change. The card is a planning view, not a pre-run
  // readiness view; live BG belongs in the topbar/prerun screen.
  const tomorrowData = useMemo(
    () => buildTomorrowData(cachedActivities, events, settings ?? {}),
    [cachedActivities, events, settings],
  );
```

- [ ] **Step 8: Run the intelScreenData tests to verify pass**

Run: `npm test -- lib/__tests__/intelScreenData.test.ts`
Expected: all tests PASS.

- [ ] **Step 9: Run typecheck across the repo**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: every test PASS. Pay particular attention to `IntelScreen.integration.test.tsx` and `TomorrowCard.integration.test.tsx` — both touch this code path.

- [ ] **Step 11: Commit**

```bash
git add lib/intelScreenData.ts lib/__tests__/intelScreenData.test.ts app/screens/IntelScreen.tsx
git commit -m "fix(intel): drop currentBG plumbing from tomorrow path; stop re-rendering on CGM ticks"
```

---

### Task 5: Verification — lint, build, smoke

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: clean. If the dropped `currentBGAtom` import in `IntelScreen.tsx` triggers an `unused-imports` rule, double-check the import block is fully cleaned up.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success. (Catches any prod-only TS configuration issues.)

- [ ] **Step 3: Manual smoke (localhost)**

Run `npm run dev` and check the Intel tab:

- [ ] Tomorrow card header reads `~40 min · 4 km · target HR 113-147 bpm (Z2)` — no `current BG` or `no live BG`.
- [ ] Ribbon label reads `Predicted end BG · typical Easy at <N> g/h` (or `· typical Easy` if no recommendation).
- [ ] Open browser devtools, watch the network tab. Wait 5 minutes for a CGM tick. The Tomorrow card's matched runs, recommended fuel rate, and predicted ribbon do NOT change.
- [ ] Hard reload (Cmd-Shift-R). Card renders identical match set and recommendation as before reload.
- [ ] Topbar still shows the live BG pill (this should be unaffected — confirm we didn't accidentally break it).

- [ ] **Step 4: Final task close-out**

Once all the above pass, the bug is fixed. With explicit go-ahead, push to dev for mobile preview:

```bash
git push origin worktree-bg-fuel-trust-redesign:dev
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** Every spec item has a corresponding task step. The two acceptance criteria around stability and predictor list are covered by Task 1 and Task 2 tests; criterion 4 (no `currentBGAtom` subscription) is enforced manually by Task 4 step 7 (no test, since this is an absence-of-subscription).
- **Type consistency:** `MatchTarget.startBG: number | null` flows from Task 1 through Task 2's `startBG: null` literal. `TomorrowData` field drops in Task 4 align with `Props` drops in Task 3.
- **Sequencing:** Task 3 commits a `Props` narrowing while `IntelScreen` still spreads excess props from `TomorrowData`. JSX spreads tolerate excess properties — the build stays green. Task 4 cleans up the data shape and the spread arrives at parity.
