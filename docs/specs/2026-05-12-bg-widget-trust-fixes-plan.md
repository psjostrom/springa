# BG Widget Trust Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore trust in three BG widgets on the Intel tab — make the dot strip readable (hover tooltip + zone labels), rename the misleading "Tomorrow" widget label to "Upcoming" *and* keep today's planned run surfaced under that label until the day rolls over, and flip the AFTER ribbon's label text colors so good post-run values stop appearing red.

**Architecture:** Three independent fixes ship in one PR. (1) Widen `CategoryStats.endBGs` from `number[]` to `{ bg: number; date: string }[]` so each dot carries its activity date; refactor `DotStrip` to use `<button>` elements with hover state and an absolutely-positioned tooltip; add permanent zone labels below the strip. (2) Change the registry label string for the `tomorrow` widget — the key, component, and data builder stay the same. (3) Promote `Ribbon`'s hardcoded label colors to a per-variant lookup so DURING keeps `low=error/high=muted` and AFTER inverts to `low=muted/high=error`.

**Tech Stack:** TypeScript · React · Vitest · React Testing Library · Tailwind · date-fns

**Spec:** `docs/specs/2026-05-12-bg-widget-trust-fixes.md`

**Project rules note:** Per Per's CLAUDE.md, commits require explicit consent ("commit", "cp"). The "Commit" steps below show the message to use, but never run without his explicit go-ahead per task.

---

## File Structure

**Modified:**
- `lib/widgetRegistry.ts` — single label string change.
- `app/components/TomorrowCard.tsx` — add `LABEL_COLORS` lookup, swap inline classes in `Ribbon`.
- `app/components/DuringPatternCards.tsx` — widen `CategoryStats.endBGs` type; refactor `Card` and `DotStrip` to add tooltip, zone labels, hover state.
- `lib/intelScreenData.ts` — `buildDuringStats` pushes `{ bg, date }` instead of plain numbers; `pickNextPlannedRun` filters by start-of-day, not exact timestamp.

**Test files modified:**
- `lib/__tests__/widgetRegistry.test.ts` — new test for the `Upcoming` label.
- `app/components/__tests__/TomorrowCard.integration.test.tsx` — two new tests for variant-based label colors.
- `app/components/__tests__/DuringPatternCards.integration.test.tsx` — fixture shape update; new tests for zone labels, hover tooltip, blur hide.
- `lib/__tests__/intelScreenData.test.ts` — new test asserting `endBGs[0]` has `{ bg, date }` shape; two new tests for `pickNextPlannedRun` day-level cutoff.

---

### Task 1: Rename `tomorrow` widget label to `Upcoming`

**Files:**
- Modify: `lib/widgetRegistry.ts`
- Test: `lib/__tests__/widgetRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to `lib/__tests__/widgetRegistry.test.ts`:

```ts
describe("DEFAULT_WIDGETS labels", () => {
  it("labels the tomorrow widget as 'Upcoming'", () => {
    const def = DEFAULT_WIDGETS.find((w) => w.key === "tomorrow");
    expect(def?.label).toBe("Upcoming");
  });
});
```

Add `DEFAULT_WIDGETS` to the existing import at the top of the file:

```ts
import {
  resolveLayout,
  moveWidget,
  toggleWidget,
  DEFAULT_ORDER,
  DEFAULT_WIDGETS,
  type WidgetKey,
} from "../widgetRegistry";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/__tests__/widgetRegistry.test.ts`
Expected: FAIL — current label is `"Tomorrow"`.

- [ ] **Step 3: Rename the label**

In `lib/widgetRegistry.ts`, change line 24:

```ts
{ key: "tomorrow", label: "Upcoming" },
```

(Was: `{ key: "tomorrow", label: "Tomorrow" },`)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/__tests__/widgetRegistry.test.ts`
Expected: PASS — new test green, all existing tests still green.

- [ ] **Step 5: Verify in the browser (optional but recommended)**

Run: `npm run dev`
Visit the Intel tab; the widget chrome above the next-run card now reads `UPCOMING` instead of `TOMORROW`.

- [ ] **Step 6: Commit (after Per's explicit go-ahead)**

```bash
git add lib/widgetRegistry.ts lib/__tests__/widgetRegistry.test.ts
git commit -m "fix(widgets): rename Tomorrow widget label to Upcoming

The widget surfaces the next planned run, which can be today, tomorrow,
or later. Labeling it 'Tomorrow' was wrong when the next run is today."
```

---

### Task 2: Variant-based label colors on `Ribbon`

**Files:**
- Modify: `app/components/TomorrowCard.tsx`
- Test: `app/components/__tests__/TomorrowCard.integration.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append two new tests to the existing `describe` block in `app/components/__tests__/TomorrowCard.integration.test.tsx`. The tests query by `data-testid` — Step 3 adds those testids to `RibbonLabel`.

```tsx
it("AFTER ribbon labels low value as muted and high value as error", () => {
  render(<TomorrowCard {...sample} />);
  const low = screen.getByTestId("ribbon-after-low");
  const high = screen.getByTestId("ribbon-after-high");
  expect(low).toHaveClass("text-muted");
  expect(low).not.toHaveClass("text-error");
  expect(high).toHaveClass("text-error");
  expect(high).not.toHaveClass("text-muted");
});

it("DURING ribbon keeps low value as error and high value as muted", () => {
  render(<TomorrowCard {...sample} />);
  expect(screen.getByTestId("ribbon-during-low")).toHaveClass("text-error");
  expect(screen.getByTestId("ribbon-during-high")).toHaveClass("text-muted");
});
```

The existing `sample` fixture (lines 7-50) already provides distinct p10/p90 for both ribbons (during: 4.4/6.6; after: 6.3/11.6). No fixture changes needed.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- app/components/__tests__/TomorrowCard.integration.test.tsx`
Expected: AFTER test FAILS — the low value currently has `text-error`, not `text-muted`. DURING test should already pass against current code.

- [ ] **Step 3: Add the `LABEL_COLORS` lookup and testids to `Ribbon`**

In `app/components/TomorrowCard.tsx`, add the constant near the other module constants (around lines 38-48 with `HYPO` and `SCALES`):

```ts
const LABEL_COLORS: Record<"during" | "after", { low: string; typical: string; high: string }> = {
  during: { low: "text-error", typical: "text-text font-bold", high: "text-muted" },
  after: { low: "text-muted", typical: "text-text font-bold", high: "text-error" },
};
```

In the `Ribbon` function (currently lines 305-353), replace the three `RibbonLabel` calls (lines 347-349):

```tsx
        <RibbonLabel testid={`ribbon-${variant}-low`}     pct={p10Pct}     valueClass={LABEL_COLORS[variant].low}     prefix="low"     value={p10} />
        <RibbonLabel testid={`ribbon-${variant}-typical`} pct={medianPct}  valueClass={LABEL_COLORS[variant].typical} prefix="typical" value={median} />
        <RibbonLabel testid={`ribbon-${variant}-high`}    pct={p90Pct}     valueClass={LABEL_COLORS[variant].high}    prefix="high"    value={p90} />
```

Add the optional `testid` prop to `RibbonLabel` (currently lines 360-383). Update the prop type and pass it through:

```tsx
function RibbonLabel({
  pct,
  valueClass,
  prefix,
  value,
  testid,
}: {
  pct: number;
  valueClass: string;
  prefix: string;
  value: number;
  testid?: string;
}) {
  const style: React.CSSProperties =
    pct < 8
      ? { left: 0 }
      : pct > 92
      ? { right: 0 }
      : { left: `${pct}%`, transform: "translateX(-50%)" };
  return (
    <span data-testid={testid} className={`absolute whitespace-nowrap ${valueClass}`} style={style}>
      <span className="text-muted font-normal">{prefix} </span>
      {value.toFixed(1)}
    </span>
  );
}
```

- [ ] **Step 4: Run the tests to verify both pass**

Run: `npm test -- app/components/__tests__/TomorrowCard.integration.test.tsx`
Expected: PASS — both new tests green, all existing tests still green.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`
Visit the Intel tab. On the Upcoming card's AFTER ribbon, the `low <value>` text is now muted gray; `high <value>` is red. DURING ribbon unchanged.

- [ ] **Step 6: Commit (after Per's explicit go-ahead)**

```bash
git add app/components/TomorrowCard.tsx app/components/__tests__/TomorrowCard.integration.test.tsx
git commit -m "fix(tomorrow): flip AFTER ribbon label colors per variant

Post-run low BG is good, high is bad — the label colors now match.
DURING ribbon keeps low=error, AFTER ribbon flips to high=error."
```

---

### Task 3: Widen `CategoryStats.endBGs` from `number[]` to `{ bg, date }[]`

This task is the data-shape foundation for Tasks 4 and 5. The component continues to render dots identically — the new `date` field is unused for now. Tasks 4 and 5 layer on top.

**Files:**
- Modify: `app/components/DuringPatternCards.tsx`
- Modify: `lib/intelScreenData.ts`
- Modify: `app/components/__tests__/DuringPatternCards.integration.test.tsx` (fixture shape)
- Modify: `lib/__tests__/intelScreenData.test.ts` (new shape assertion)

- [ ] **Step 1: Update test fixtures to the new shape**

In `app/components/__tests__/DuringPatternCards.integration.test.tsx`, replace the `sampleStats` literal at lines 5-27:

```ts
const mkBGs = (vals: number[]) =>
  vals.map((bg, i) => ({ bg, date: `2026-04-${String((i % 28) + 1).padStart(2, "0")}` }));

const sampleStats = {
  easy: {
    runCount: 38,
    medianEndBG: 7.8,
    endBGs: mkBGs([3.8, 5, 6, 7, 8, 9, 10, 12, 14]),
    hypoCount: 1,
    avgDropPerHr: -2.5,
  },
  long: {
    runCount: 13,
    medianEndBG: 7.5,
    endBGs: mkBGs([6.1, 7, 8, 11, 13.6]),
    hypoCount: 0,
    avgDropPerHr: -1.5,
  },
  interval: {
    runCount: 15,
    medianEndBG: 7.8,
    endBGs: mkBGs([3.9, 4.6, 5.8, 8.7, 11.7]),
    hypoCount: 2,
    avgDropPerHr: -2.7,
  },
};
```

- [ ] **Step 2: Add the new shape assertion in `intelScreenData.test.ts`**

Append a new test inside the existing `describe("buildIntelScreenData", ...)` block in `lib/__tests__/intelScreenData.test.ts`:

```ts
  it("populates endBGs with { bg, date } drawn from the source activity", () => {
    const activities: CachedActivity[] = [
      makeActivity({
        activityId: "a1",
        category: "easy",
        activityDate: "2026-04-15",
        glucose: [
          { time: 0, value: 8.0 },
          { time: 30, value: 6.5 },
          { time: 60, value: 5.2 },
        ],
      }),
    ];
    const result = buildIntelScreenData(
      activities,
      [],
      {},
      new Date("2026-04-16T07:00:00Z"),
    );
    const easy = result.during.easy;
    expect(easy?.endBGs.length).toBe(1);
    expect(easy?.endBGs[0]).toEqual({ bg: 5.2, date: "2026-04-15" });
  });
```

(Use the file's existing `makeActivity` helper at lines 11-28 and `buildIntelScreenData` import at lines 2-6.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- app/components/__tests__/DuringPatternCards.integration.test.tsx lib/__tests__/intelScreenData.test.ts`
Expected: FAIL — TypeScript errors on the fixture shape (current type is `number[]`); the new `intelScreenData` test errors on `bg`/`date` access.

- [ ] **Step 4: Widen the `CategoryStats` type and the `DotStrip` consumer**

In `app/components/DuringPatternCards.tsx`, update the interface (lines 6-12):

```ts
export interface CategoryStats {
  runCount: number;
  medianEndBG: number;
  endBGs: { bg: number; date: string }[];
  hypoCount: number;
  avgDropPerHr: number;
}
```

Update `DotStrip` to read the `bg` field (lines 87-111). Replace the function body:

```tsx
function DotStrip({ endBGs }: { endBGs: { bg: number; date: string }[] }) {
  const hypoEnd = ((HYPO - MIN) / SPAN) * 100;
  const highStart = ((HIGH - MIN) / SPAN) * 100;
  return (
    <div className="relative h-7 my-2">
      <div className="absolute top-1 bottom-0 left-0 bg-error opacity-20" style={{ width: `${hypoEnd}%` }} />
      <div
        className="absolute top-1 bottom-0 right-0 bg-warning opacity-20"
        style={{ width: `${100 - highStart}%` }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-border-subtle" />
      {endBGs.map(({ bg }, i) => {
        const left = Math.max(0, Math.min(100, ((bg - MIN) / SPAN) * 100));
        const color = bg < HYPO ? "bg-error" : bg > HIGH ? "bg-warning" : "bg-success";
        return (
          <span
            key={`${i}-${bg}`}
            className={`absolute top-1/2 w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 ${color}`}
            style={{ left: `${left}%` }}
          />
        );
      })}
    </div>
  );
}
```

(Identical to the current rendering — just destructures `{ bg }` from each element. Tasks 4 and 5 evolve this further.)

- [ ] **Step 5: Update `buildDuringStats` to push `{ bg, date }`**

In `lib/intelScreenData.ts`, update `buildDuringStats` (lines 120-160). Replace the inner accumulator type and the push:

```ts
    const endBGs: { bg: number; date: string }[] = [];
    let hypoCount = 0;
    let totalDropPerHr = 0;
    let dropSamples = 0;

    for (const a of inCat) {
      const end = endBGFromActivity(a);
      if (end == null) continue;
      endBGs.push({ bg: end, date: a.activityDate ?? "" });
      if ((a.glucose ?? []).some((g) => g.value < HYPO)) hypoCount++;

      const start = startBGFromActivity(a);
      const hours = durationHoursFromGlucose(a.glucose ?? []);
      if (start != null && hours > 0) {
        totalDropPerHr += (start - end) / hours;
        dropSamples++;
      }
    }
```

Update the `medianEndBG` computation a few lines below — `median()` operates on numbers, so map first:

```ts
    out[cat] = {
      runCount: endBGs.length,
      medianEndBG: median(endBGs.map((e) => e.bg)),
      endBGs,
      hypoCount,
      avgDropPerHr: dropSamples > 0 ? totalDropPerHr / dropSamples : 0,
    };
```

- [ ] **Step 6: Run all affected tests to verify they pass**

Run: `npm test -- lib/__tests__/intelScreenData.test.ts app/components/__tests__/DuringPatternCards.integration.test.tsx`
Expected: PASS — new shape test green, fixture-using tests green.

- [ ] **Step 7: Run typecheck to catch any other consumers**

Run: `npx tsc --noEmit`
Expected: clean. If any file fails on `endBGs` access, update it to read `.bg`. (Grep confirmed only `DuringPatternCards.tsx` and `intelScreenData.ts` use this field, so there should be none.)

- [ ] **Step 8: Commit (after Per's explicit go-ahead)**

```bash
git add app/components/DuringPatternCards.tsx lib/intelScreenData.ts \
  app/components/__tests__/DuringPatternCards.integration.test.tsx \
  lib/__tests__/intelScreenData.test.ts
git commit -m "refactor(during): widen endBGs to {bg, date}[]

Each dot in the During the Run strip now carries its source activity
date. No visual change yet — Tasks 4 and 5 surface the new field."
```

---

### Task 4: Add zone labels under the dot strip

**Files:**
- Modify: `app/components/DuringPatternCards.tsx`
- Test: `app/components/__tests__/DuringPatternCards.integration.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to the existing `describe("DuringPatternCards", ...)` block:

```tsx
  it("renders hypo and high zone labels under each dot strip", () => {
    render(<DuringPatternCards stats={sampleStats} />);
    // Three category cards rendered → expect three of each zone label.
    expect(screen.getAllByText(/hypo <4\.0/i).length).toBe(3);
    expect(screen.getAllByText(/high >10\.0/i).length).toBe(3);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- app/components/__tests__/DuringPatternCards.integration.test.tsx`
Expected: FAIL — labels not in the document.

- [ ] **Step 3: Add a wrapper around `DotStrip` and render zone labels below**

In `app/components/DuringPatternCards.tsx`, replace the `DotStrip` function (current lines 87-111) with:

```tsx
function DotStrip({ endBGs }: { endBGs: { bg: number; date: string }[] }) {
  const hypoEnd = ((HYPO - MIN) / SPAN) * 100;
  const highStart = ((HIGH - MIN) / SPAN) * 100;
  return (
    <div className="my-2">
      <div className="relative h-7">
        <div className="absolute top-1 bottom-0 left-0 bg-error opacity-20" style={{ width: `${hypoEnd}%` }} />
        <div
          className="absolute top-1 bottom-0 right-0 bg-warning opacity-20"
          style={{ width: `${100 - highStart}%` }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-border-subtle" />
        {endBGs.map(({ bg }, i) => {
          const left = Math.max(0, Math.min(100, ((bg - MIN) / SPAN) * 100));
          const color = bg < HYPO ? "bg-error" : bg > HIGH ? "bg-warning" : "bg-success";
          return (
            <span
              key={`${i}-${bg}`}
              className={`absolute top-1/2 w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 ${color}`}
              style={{ left: `${left}%` }}
            />
          );
        })}
      </div>
      <div className="relative h-3 mt-1 text-[10px] tabular-nums">
        <span className="absolute left-0 text-error">hypo &lt;4.0</span>
        <span className="absolute right-0 text-warning">high &gt;10.0</span>
      </div>
    </div>
  );
}
```

(Changes vs. Task 3: outer `relative h-7 my-2` becomes a wrapping `my-2` div; the strip itself moves into a child `relative h-7`; new label row appended below.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- app/components/__tests__/DuringPatternCards.integration.test.tsx`
Expected: PASS — new test green, all existing tests still green.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`
Visit the Intel tab. Each "During the Run" category card now shows `hypo <4.0` (red, left) and `high >10.0` (warning, right) below the strip.

- [ ] **Step 6: Commit (after Per's explicit go-ahead)**

```bash
git add app/components/DuringPatternCards.tsx app/components/__tests__/DuringPatternCards.integration.test.tsx
git commit -m "feat(during): add hypo and high zone labels under dot strip

The colored zones at the strip's edges previously had no labels — the
runner couldn't tell what the red and orange regions meant. Labels now
sit directly under each zone."
```

---

### Task 5: Add hover tooltip to dots

**Files:**
- Modify: `app/components/DuringPatternCards.tsx`
- Test: `app/components/__tests__/DuringPatternCards.integration.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe` block in `app/components/__tests__/DuringPatternCards.integration.test.tsx`. The `DotTooltip` component (added in Step 5) renders with `role="tooltip"`, so the test queries by role:

```tsx
import userEvent from "@testing-library/user-event";

  it("shows a tooltip with date and value when a dot is hovered", async () => {
    const user = userEvent.setup();
    render(<DuringPatternCards stats={sampleStats} />);
    const intervalCard = screen.getByTestId("during-card-interval");
    expect(within(intervalCard).queryByRole("tooltip")).not.toBeInTheDocument();
    // Interval fixture's first dot: bg=3.9, date="2026-04-01" → "Apr 1 · 3.9 mmol/L".
    const firstDot = within(intervalCard).getAllByRole("button")[0];
    await user.hover(firstDot);
    const tooltip = within(intervalCard).getByRole("tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toMatch(/Apr 1.*3\.9 mmol\/L/);
  });

  it("hides the tooltip when the focused dot blurs", () => {
    render(<DuringPatternCards stats={sampleStats} />);
    const intervalCard = screen.getByTestId("during-card-interval");
    const firstDot = within(intervalCard).getAllByRole("button")[0];
    firstDot.focus();
    expect(within(intervalCard).getByRole("tooltip")).toBeInTheDocument();
    firstDot.blur();
    expect(within(intervalCard).queryByRole("tooltip")).not.toBeInTheDocument();
  });
```

`@testing-library/user-event` is already a dev dependency (used by other integration tests in the same folder, e.g. `TomorrowCard.integration.test.tsx:2`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- app/components/__tests__/DuringPatternCards.integration.test.tsx`
Expected: FAIL — dots are currently `<span>` elements with no role, no aria-label, no hover behavior.

- [ ] **Step 3: Add date-fns import and small helpers**

At the top of `app/components/DuringPatternCards.tsx`, add:

```tsx
import { useState } from "react";
import { format } from "date-fns";
```

Add a small local date parser near the existing constants (mirrors `parseLocalDate` in `TomorrowCard.tsx`):

```ts
function parseLocalDate(dateIso: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatTooltipDate(dateIso: string): string {
  if (!dateIso) return "";
  return format(parseLocalDate(dateIso), "MMM d");
}
```

- [ ] **Step 4: Refactor `Card` to own hover state and pass it to the strip**

Replace the `Card` function (current lines 47-85) with:

```tsx
function Card({
  cat,
  stats,
  isWorst,
}: {
  cat: WorkoutCategory;
  stats: CategoryStats;
  isWorst: boolean;
}) {
  const hypoPct = Math.round((stats.hypoCount / stats.runCount) * 100);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  return (
    <div
      role="region"
      aria-label={WORKOUT_CATEGORY_LABEL[cat]}
      data-testid={`during-card-${cat}`}
      className={`bg-surface border rounded-xl p-3 ${isWorst && hypoPct >= 5 ? "border-error/40" : "border-border"}`}
    >
      <div className="flex justify-between items-center mb-2">
        <span data-testid="during-card-name" className={`text-sm font-bold ${NAME_COLOR[cat]}`}>
          {WORKOUT_CATEGORY_LABEL[cat]}
        </span>
        <span className="text-xs text-muted">{stats.runCount} run{stats.runCount === 1 ? "" : "s"}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tabular-nums">{stats.medianEndBG.toFixed(1)}</span>
        <span className="text-xs text-muted">typical end BG (mmol/L)</span>
      </div>
      <DotStrip endBGs={stats.endBGs} hoveredIdx={hoveredIdx} onHover={setHoveredIdx} />
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Tile
          label="Hypo runs (min < 4.0)"
          value={`${stats.hypoCount} of ${stats.runCount} · ${hypoPct}%`}
          danger={hypoPct >= 10}
        />
        <Tile label="Avg drop" value={`${stats.avgDropPerHr.toFixed(1)} mmol/hr`} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Refactor `DotStrip` to render buttons + tooltip**

Replace the `DotStrip` function (the version from Task 4) with:

```tsx
function DotStrip({
  endBGs,
  hoveredIdx,
  onHover,
}: {
  endBGs: { bg: number; date: string }[];
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
}) {
  const hypoEnd = ((HYPO - MIN) / SPAN) * 100;
  const highStart = ((HIGH - MIN) / SPAN) * 100;

  const hovered = hoveredIdx != null ? endBGs[hoveredIdx] : null;
  const hoveredLeftPct =
    hovered != null
      ? Math.max(0, Math.min(100, ((hovered.bg - MIN) / SPAN) * 100))
      : 0;

  return (
    <div className="relative my-2">
      {hovered && (
        <DotTooltip bg={hovered.bg} date={hovered.date} leftPct={hoveredLeftPct} />
      )}
      <div className="relative h-7 mt-5">
        <div className="absolute top-1 bottom-0 left-0 bg-error opacity-20" style={{ width: `${hypoEnd}%` }} />
        <div
          className="absolute top-1 bottom-0 right-0 bg-warning opacity-20"
          style={{ width: `${100 - highStart}%` }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-border-subtle" />
        {endBGs.map(({ bg, date }, i) => {
          const left = Math.max(0, Math.min(100, ((bg - MIN) / SPAN) * 100));
          const color = bg < HYPO ? "bg-error" : bg > HIGH ? "bg-warning" : "bg-success";
          const dateLabel = date ? `${formatTooltipDate(date)} · ` : "";
          return (
            <button
              key={`${i}-${bg}`}
              type="button"
              aria-label={`${dateLabel}${bg.toFixed(1)} mmol/L`}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(i)}
              onBlur={() => onHover(null)}
              className={`absolute top-1/2 w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 ${color} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40`}
              style={{ left: `${left}%` }}
            />
          );
        })}
      </div>
      <div className="relative h-3 mt-1 text-[10px] tabular-nums">
        <span className="absolute left-0 text-error">hypo &lt;4.0</span>
        <span className="absolute right-0 text-warning">high &gt;10.0</span>
      </div>
    </div>
  );
}

function DotTooltip({
  bg,
  date,
  leftPct,
}: {
  bg: number;
  date: string;
  leftPct: number;
}) {
  const style: React.CSSProperties =
    leftPct < 8
      ? { left: 0 }
      : leftPct > 92
      ? { right: 0 }
      : { left: `${leftPct}%`, transform: "translateX(-50%)" };
  const dateLabel = date ? formatTooltipDate(date) : "";
  return (
    <div
      role="tooltip"
      className="absolute top-0 z-10 px-2 py-0.5 bg-surface-alt border border-border-subtle rounded text-[10px] tabular-nums whitespace-nowrap pointer-events-none"
      style={style}
    >
      {dateLabel && <span className="text-muted">{dateLabel} · </span>}
      <strong>{bg.toFixed(1)} mmol/L</strong>
    </div>
  );
}
```

(Changes vs. Task 4: dots are now `<button>` elements with hover/focus handlers; new `DotTooltip` rendered above the strip when a dot is hovered/focused; the strip's container moved from `relative h-7` to a wrapping `relative my-2` with the actual strip pushed down by `mt-5` to leave room for the tooltip.)

- [ ] **Step 6: Run all affected tests to verify they pass**

Run: `npm test -- app/components/__tests__/DuringPatternCards.integration.test.tsx`
Expected: PASS — both new tests green, existing tests still green.

- [ ] **Step 7: Run the full test suite to catch unintended regressions**

Run: `npm test`
Expected: PASS — all unit, integration, and flow tests green.

- [ ] **Step 8: Verify in the browser**

Run: `npm run dev`
Visit the Intel tab. Hover a dot in any "During the Run" category card → small floating tooltip above the strip shows `Apr 23 · 7.8 mmol/L`. Move the cursor away → tooltip disappears. Tab through the dots with the keyboard → focus ring + tooltip appear. On mobile (responsive view), tap a dot → tooltip; tap elsewhere → tooltip hides.

- [ ] **Step 9: Commit (after Per's explicit go-ahead)**

```bash
git add app/components/DuringPatternCards.tsx app/components/__tests__/DuringPatternCards.integration.test.tsx
git commit -m "feat(during): hover tooltip on dot strip with date and value

Each dot now renders as a focusable button with an aria-label and a
floating tooltip that shows the source activity's date and end BG.
Works for mouse hover, keyboard focus, and mobile tap (focus on tap,
blur on tap-elsewhere)."
```

---

### Task 6: Filter `pickNextPlannedRun` by start-of-day, not exact timestamp

Discovered while verifying Task 1 in the browser: today's planned run dropped out of "Upcoming" once its scheduled hour passed, even though the runner hadn't done it. Without this fix, renaming the widget to "Upcoming" makes it *less* trustworthy.

**Files:**
- Modify: `lib/intelScreenData.ts` (add `startOfDay` import, change the timestamp comparison)
- Test: `lib/__tests__/intelScreenData.test.ts` (two new tests — one for "stays today," one for "advances next day")

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe("buildIntelScreenData", ...)` block in `lib/__tests__/intelScreenData.test.ts`:

```ts
  it("keeps today's planned run as 'next' even when its scheduled start has passed", () => {
    // Planned run today at 10:00; reference is today at 14:00. Earlier behavior
    // would skip this event because 10:00 < 14:00 — but the runner hasn't done
    // it yet, so it must stay surfaced until the day rolls over.
    const events: CalendarEvent[] = [
      {
        id: "today",
        date: new Date("2026-04-14T10:00:00Z"),
        name: "W14 Easy + Strides",
        description: "",
        type: "planned",
        category: "easy",
        distance: 4000,
        duration: 2400,
      },
      {
        id: "thursday",
        date: new Date("2026-04-16T16:30:00Z"),
        name: "W14 Club Run",
        description: "",
        type: "planned",
        category: "interval",
        distance: 7000,
        duration: 3000,
      },
    ];
    const reference = new Date("2026-04-14T14:00:00Z"); // 4 hours after the planned start
    const result = buildIntelScreenData([], events, {}, reference);
    expect(result.tomorrow?.workout.name).toBe("W14 Easy + Strides");
  });

  it("advances to the next day's planned run once the day rolls over", () => {
    const events: CalendarEvent[] = [
      {
        id: "yesterday",
        date: new Date("2026-04-14T10:00:00Z"),
        name: "W14 Easy + Strides",
        description: "",
        type: "planned",
        category: "easy",
        distance: 4000,
        duration: 2400,
      },
      {
        id: "thursday",
        date: new Date("2026-04-16T16:30:00Z"),
        name: "W14 Club Run",
        description: "",
        type: "planned",
        category: "interval",
        distance: 7000,
        duration: 3000,
      },
    ];
    const reference = new Date("2026-04-15T07:00:00Z");
    const result = buildIntelScreenData([], events, {}, reference);
    expect(result.tomorrow?.workout.name).toBe("W14 Club Run");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/__tests__/intelScreenData.test.ts`
Expected: FAIL — first test returns "W14 Club Run" instead of "W14 Easy + Strides" because the current filter excludes today's run when its scheduled time has passed.

- [ ] **Step 3: Add `startOfDay` import and switch filter to day-level cutoff**

In `lib/intelScreenData.ts`, add to the imports at the top:

```ts
import { startOfDay } from "date-fns";
```

Replace `pickNextPlannedRun` (current lines 267-277):

```ts
function pickNextPlannedRun(events: CalendarEvent[], reference: Date): CalendarEvent | null {
  // Compare by start-of-day, not exact timestamp. A planned run at 10:00 today is
  // still "upcoming" at 14:00 today if it hasn't been completed — it just slipped
  // its scheduled time. Only when the day rolls over do we advance to the next run.
  const dayCutoff = startOfDay(reference).getTime();
  const future = events
    .filter(
      (e) =>
        (e.type === "planned" || e.type === "race") &&
        e.date.getTime() >= dayCutoff &&
        (e.category === "easy" || e.category === "long" || e.category === "interval" || e.category === "race"),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return future[0] ?? null;
}
```

- [ ] **Step 4: Run tests to verify both pass**

Run: `npm test -- lib/__tests__/intelScreenData.test.ts`
Expected: PASS — both new tests green, all existing tests still green.

- [ ] **Step 5: Commit (after Per's explicit go-ahead)**

```bash
git add lib/intelScreenData.ts lib/__tests__/intelScreenData.test.ts
git commit -m "fix(intel): keep today's planned run as Upcoming until day rolls over

pickNextPlannedRun compared exact timestamps, so a run scheduled for
10:00 today silently dropped off Upcoming once the clock hit 10:00 —
even though the runner hadn't done it. Filter by start-of-day instead:
today's planned run stays surfaced until midnight."
```

---

## Final Verification

After all six tasks land:

- [ ] **Run lint and typecheck**

```bash
npm run lint
npx tsc --noEmit
```

Expected: clean.

- [ ] **Run the full test suite**

```bash
npm test
```

Expected: all green.

- [ ] **Browser walkthrough on the Intel tab**

1. Widget chrome above the next-run card reads `UPCOMING`.
2. AFTER ribbon: `low <value>` is muted gray, `high <value>` is red.
3. DURING ribbon (same card): `low <value>` is red, `high <value>` is muted (unchanged).
4. Each "During the Run" category card shows `hypo <4.0` and `high >10.0` zone labels under the strip.
5. Hovering a dot in any category card shows a tooltip with `MMM d · X.X mmol/L`.
6. Keyboard tabbing reaches the dots; focus shows the same tooltip.
7. On a touch device or mobile viewport, tap a dot to show, tap elsewhere to hide.

---

## Self-Review Notes

**Spec coverage:**
- Spec §1 (dot tooltip + zone labels): Tasks 3, 4, 5.
- Spec §2 (widget rename): Task 1.
- Spec §3 (variant label colors): Task 2.
- Spec §4 (today's run stays surfaced): Task 6.
- Spec acceptance criterion #6 (no visual change to dot colors / gradient / numeric values): preserved by Task 3's straight-port refactor and Tasks 4-5's additive changes.
- Spec test changes: each test file's required updates are mapped to the corresponding task.

**Sequencing:**
- Tasks 1, 2, and 6 are independent of the rest and could ship in any order.
- Task 3 must precede Tasks 4 and 5 (data shape).
- Tasks 4 and 5 are independent of each other; doing 4 first leaves a coherent intermediate state (zone labels visible, no tooltip yet).

**No placeholders verified:** every code block is complete; every command has expected output.
