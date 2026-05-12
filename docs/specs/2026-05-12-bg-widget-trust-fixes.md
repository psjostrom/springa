# BG widget trust fixes

**Date:** 2026-05-12
**Status:** Spec
**Related:** `docs/specs/2026-05-10-bg-fuel-trust-redesign-design.md`, `docs/specs/2026-05-11-tomorrow-card-startbg-fix.md`

## Problem

Four trust-eroding issues across the BG widgets on the Intel tab:

1. **Dot strip is unreadable.** The "During the Run" widget shows scattered dots on a colored bar — one dot per past run, X-position = end BG. There is no tooltip on the dots, no scale labels, and no zone labels. The runner has no way to know what value any individual dot represents, or what the colored zones mean.

2. **"Tomorrow" widget label is wrong.** The widget chrome reads "TOMORROW," but the card surfaces the *next planned run*, which can be today, tomorrow, or later. On 2026-05-12 (Tue) the card showed Tue · May 12 · 12:00 — today's run, labeled "TOMORROW." `pickNextPlannedRun` (`lib/intelScreenData.ts:267-277`) explicitly picks the next run from the current date forward; the data is correct, the label is misleading.

3. **AFTER ribbon flags good values as bad.** The ribbon under "AFTER · 2H POST-RUN" labels its endpoints `low` and `high`. The "low" value (e.g., 8.5 mmol/L) renders in red text via `text-error`, suggesting it's dangerous. But 8.5 mmol/L two hours post-run is a *good* outcome — it's the high end (e.g., 16.9 mmol/L) that's bad. The ribbon's color *gradient* is already inverted correctly per variant (`TomorrowCard.tsx:322-325`); only the *label text colors* are hardcoded against the AFTER variant.

4. **Today's planned run drops out of "Upcoming" once its scheduled hour passes.** Discovered while verifying issue #2: `pickNextPlannedRun` filters with `e.date.getTime() >= reference.getTime()`, comparing exact timestamps. A planned run scheduled for 10:00 today is treated as "in the past" at 11:00, so the widget jumps to the next future run (e.g., Thursday) — even though the runner hasn't done today's run yet. Renaming the label to "Upcoming" without fixing this would make the widget *less* trustworthy, not more: it would confidently mislabel the wrong run.

## Fix

Four small, independent fixes. One spec because they ship together as one trust-restoring pass.

### 1. Dot strip — hover tooltip + zone labels

**File:** `app/components/DuringPatternCards.tsx`

- Widen the per-dot data shape so the tooltip can show a date:
  ```ts
  export interface CategoryStats {
    runCount: number;
    medianEndBG: number;
    endBGs: { bg: number; date: string }[]; // was: number[]
    hypoCount: number;
    avgDropPerHr: number;
  }
  ```
- `DotStrip` renders each dot as a `<button type="button">` with `aria-label` describing the value and date.
- Card-level state: `hoveredIdx: number | null`. Set on `onMouseEnter` and `onFocus`; clear on `onMouseLeave` and `onBlur`. The same hover state covers desktop hover, keyboard focus, and mobile tap (focus fires on tap; blur fires on tap-elsewhere).
- When `hoveredIdx != null`, render a small tooltip absolutely positioned above the strip near the dot. Tooltip content: `MMM d · 7.8 mmol/L` formatted with `date-fns`.
- Tooltip horizontal positioning mirrors `RibbonLabel` in `TomorrowCard.tsx`: anchor `left: 0` when the dot is in the leftmost ~8%, anchor `right: 0` when in the rightmost ~8%, otherwise center on the dot.
- Tooltip vertical positioning: absolutely positioned just above the strip (`bottom: 100%` on the strip's relative container, with a small gap). The strip container needs `overflow: visible` (default for `relative`); the surrounding Card has `p-3` padding which gives breathing room, but if a tooltip near the top edge clips against the Card's top border, lift the strip's top margin (`my-2` → `mt-3 mb-2`) so the tooltip lands within the Card's padding box.
- Tooltip needs a `z-10` (or similar) so it renders above sibling dots and the colored zone backgrounds.
- Add permanent zone labels under the strip:
  - Left, under the red zone: `hypo <4.0` in `text-error`
  - Right, under the orange zone: `high >10.0` in `text-warning`
  - Middle: no label (in-range is implicit)
- Keep the existing dot color logic (red/green/orange thresholds at HYPO=4.0 / HIGH=10.0).

**Data plumbing:** `lib/intelScreenData.ts` `buildDuringStats` (lines 120-160) already iterates `CachedActivity[]`. Replace `endBGs.push(end)` with `endBGs.push({ bg: end, date: a.activityDate ?? "" })`. In the component, the tooltip omits the date prefix when `date === ""` (defensive — in practice every activity with glucose data has an `activityDate`). The dot itself always renders.

### 2. Widget rename

**File:** `lib/widgetRegistry.ts`

- Change `{ key: "tomorrow", label: "Tomorrow" }` to `{ key: "tomorrow", label: "Upcoming" }`.
- Widget key stays `"tomorrow"` — saved layouts continue to work, no migration needed.
- Component name `TomorrowCard`, file `TomorrowCard.tsx`, atom names, and data builder names all stay. Renaming those is broader cleanup; out of scope here.

### 4. Keep today's planned run surfaced until the day rolls over

**File:** `lib/intelScreenData.ts`

- In `pickNextPlannedRun`, replace the timestamp comparison with a day-level cutoff:
  ```ts
  import { startOfDay } from "date-fns";

  function pickNextPlannedRun(events: CalendarEvent[], reference: Date): CalendarEvent | null {
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
- Behavior: a planned run scheduled for 10:00 today is still selected at 14:00 today. Once midnight passes, today drops off and the next future run wins.
- This intentionally does NOT consider completion status. A planned event paired with a completed activity is already filtered out upstream by `processPlannedEvents` (it omits events with `paired_activity_id` matching an activity in the activity map). So "still planned today" implies "not yet done."

### 3. AFTER ribbon — variant-based label colors

**File:** `app/components/TomorrowCard.tsx`

- Promote the three label color classes from inline literals (lines 347-349) to a `LABEL_COLORS` lookup keyed by variant:
  ```ts
  const LABEL_COLORS: Record<"during" | "after", { low: string; typical: string; high: string }> = {
    during: { low: "text-error",  typical: "text-text font-bold", high: "text-muted" },
    after:  { low: "text-muted",  typical: "text-text font-bold", high: "text-error" },
  };
  ```
- In `Ribbon`, look up `LABEL_COLORS[variant]` and pass the matching class to each `RibbonLabel`.
- Result on the AFTER ribbon: `low 8.5` is muted gray, `typical 12.9` is bold, `high 16.9` is red.
- DURING ribbon is unchanged in appearance.

## Acceptance criteria

1. Hovering (or focusing) a dot in any "During the Run" category card reveals a tooltip with `MMM d · X.X mmol/L` (e.g., `Apr 23 · 7.8 mmol/L`). Moving the cursor or focus away hides it.
2. Tapping a dot on a touch device shows the same tooltip (focus fires on tap); tapping elsewhere blurs the dot, hiding the tooltip.
3. Each "During the Run" card shows two permanent zone labels under the strip: `hypo <4.0` (left, red) and `high >10.0` (right, warning).
4. The widget chrome above the next-run card reads "Upcoming" instead of "Tomorrow."
5. On the AFTER ribbon, the `low` value renders in `text-muted`, `high` in `text-error`. On the DURING ribbon, `low` stays in `text-error`, `high` stays in `text-muted`.
6. No visible change to dot colors, gradient direction, or numeric values anywhere.
7. A planned run scheduled for 10:00 today is still surfaced as "Upcoming" at 14:00 today. Once the calendar day rolls over (next morning), the next future run takes over.

## Test changes

**`app/components/__tests__/DuringPatternCards.integration.test.tsx`**
- Update: existing fixtures at lines 9, 16, 23 use `endBGs: number[]` literals. Convert to `{ bg, date }[]` shape with realistic ISO dates.
- New: `hovering a dot shows a tooltip with date and value` — render a card with two dots at known values and dates; fire `pointerover` on one button; assert the tooltip text is in the document.
- New: `blurring a dot hides the tooltip` — focus a dot, assert tooltip visible, blur, assert gone.
- New: `renders zone labels under the strip` — assert `hypo <4.0` and `high >10.0` are in the document for each rendered card.

**`lib/__tests__/intelScreenData.test.ts`**
- Currently does not assert on `endBGs` shape. Add a new case under `buildIntelScreenData`: assert `result.duringStats.easy?.endBGs[0]` is `{ bg: <number>, date: <string> }` and that the date matches the source activity's `activityDate`.
- New: `keeps today's planned run as 'next' even when its scheduled start has passed` — fixture has a planned event today at 10:00 and another planned event Thursday; reference time is today at 14:00; assert `result.tomorrow?.workout.name` is today's run.
- New: `advances to the next day's planned run once the day rolls over` — same fixture, reference is the next morning; assert `result.tomorrow?.workout.name` is Thursday's run.

**`app/components/__tests__/TomorrowCard.integration.test.tsx`**
- New: `AFTER ribbon labels low value as muted and high value as error` — render a card with a prediction containing distinct p10/p90 peak BGs; query the rendered nodes for the low value and assert its class list contains `text-muted` (not `text-error`); same for high → `text-error`.
- New: `DURING ribbon keeps low=error, high=muted` — opposite assertion on the during ribbon to lock in the variant split.
- (No existing color-class assertions — these are pure additions.)

**`lib/__tests__/widgetRegistry.test.ts`**
- Currently has no label assertions. Add one new test: `tomorrow widget label is "Upcoming"` — import `DEFAULT_WIDGETS`, find the entry with `key === "tomorrow"`, assert `label === "Upcoming"`. Locks the user-facing label against accidental rename.

## Out of scope

- Renaming the `TomorrowCard` component, `tomorrow` widget key, `buildTomorrow` data builder, or `tomorrowAtom`. The user-facing label change is the trust fix; internal naming consistency is a separate refactor.
- Tap-to-navigate from a dot to the source activity. Mentioned as a possible follow-up; not included.
- Reworking the dot color thresholds (HYPO=4.0, HIGH=10.0) or the X-axis scale (3.5–14). The legend exposes the existing semantics; it does not change them.
- Generalizing `RibbonLabel` positioning logic into a shared utility. The dot-strip tooltip uses the same anchor pattern but is local to that component.
- Touching the AFTER widget (`bg-after`) or any other BG widget beyond the four issues listed above.
- Fixing the latent timezone bug in `processPlannedEvents` (`lib/calendarPipeline.ts:238`) where `parseISO(event.start_date_local)` is timezone-server-dependent (the comment at lines 125-128 of the same file warns about this for the activities path). The day-level filter in fix #4 dodges the most visible symptom; the underlying parsing is a separate bug with a wider blast radius. Track separately.
