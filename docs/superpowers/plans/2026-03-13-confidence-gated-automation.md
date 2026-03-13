# Confidence-Gated Automation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate fuel rate auto-sync on BG model confidence — low-confidence targets become opt-in suggestions instead of auto-applied changes.

**Architecture:** Add `getFuelConfidence()` to `lib/fuelRate.ts`. Attach confidence to `AdaptationChange` in `adaptFuelRate()`. PlannerScreen uses confidence to render suggestion badges and exclude low-confidence changes from sync unless opted in via per-event checkbox.

**Tech Stack:** TypeScript, Vitest, React (Next.js App Router)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/fuelRate.ts` | Modify | Add `getFuelConfidence()` export |
| `lib/__tests__/fuelRate.test.ts` | Create | Tests for `getFuelConfidence()` |
| `lib/adaptPlan.ts` | Modify | Add `confidence` to `AdaptationChange`, pass through in `adaptFuelRate()` |
| `lib/__tests__/adaptPlan.test.ts` | Modify | Add confidence-related tests |
| `app/screens/PlannerScreen.tsx` | Modify | Suggestion badge, checkbox, selective sync |

---

## Chunk 1: Backend — getFuelConfidence + adaptFuelRate confidence

### Task 1: getFuelConfidence

**Files:**
- Create: `lib/__tests__/fuelRate.test.ts`
- Modify: `lib/fuelRate.ts`

- [ ] **Step 1: Write failing tests for getFuelConfidence**

Create `lib/__tests__/fuelRate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getFuelConfidence } from "../fuelRate";
import type { BGResponseModel, TargetFuelResult } from "../bgModel";

function makeTarget(
  category: "easy" | "long" | "interval",
  rate: number,
  confidence: "low" | "medium" | "high" = "medium",
): TargetFuelResult {
  return { category, targetFuelRate: rate, currentAvgFuel: rate - 5, method: "regression", confidence };
}

function makeBGModel(targets: TargetFuelResult[] = []): BGResponseModel {
  return {
    categories: {
      easy: { category: "easy", avgRate: -0.3, medianRate: -0.3, sampleCount: 20, confidence: "medium", avgFuelRate: 45, activityCount: 5 },
      long: { category: "long", avgRate: -0.6, medianRate: -0.55, sampleCount: 15, confidence: "medium", avgFuelRate: 58, activityCount: 4 },
      interval: { category: "interval", avgRate: -0.8, medianRate: -0.75, sampleCount: 10, confidence: "low", avgFuelRate: 28, activityCount: 3 },
    },
    observations: [],
    activitiesAnalyzed: 12,
    bgByStartLevel: [],
    bgByEntrySlope: [],
    bgByTime: [],
    targetFuelRates: targets,
  };
}

describe("getFuelConfidence", () => {
  it("returns confidence from matching target", () => {
    const bgModel = makeBGModel([makeTarget("easy", 48, "high")]);
    expect(getFuelConfidence("easy", bgModel)).toBe("high");
  });

  it("returns null when no target exists for category", () => {
    const bgModel = makeBGModel([makeTarget("easy", 48)]);
    expect(getFuelConfidence("interval", bgModel)).toBeNull();
  });

  it("returns null when bgModel is null", () => {
    expect(getFuelConfidence("easy", null)).toBeNull();
  });

  it("returns null when bgModel is undefined", () => {
    expect(getFuelConfidence("easy", undefined)).toBeNull();
  });

  it("returns low confidence for low-confidence target", () => {
    const bgModel = makeBGModel([makeTarget("long", 65, "low")]);
    expect(getFuelConfidence("long", bgModel)).toBe("low");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/__tests__/fuelRate.test.ts`
Expected: FAIL — `getFuelConfidence` is not exported from `../fuelRate`

- [ ] **Step 3: Implement getFuelConfidence**

Add to `lib/fuelRate.ts` after `getCurrentFuelRate`:

```typescript
/**
 * Resolve the confidence level for a category's fuel rate.
 * Returns the confidence from the BG model target, or null if
 * the fuel rate didn't come from a model target (category avg or default).
 */
export function getFuelConfidence(
  category: WorkoutCategory,
  bgModel: BGResponseModel | null | undefined,
): "low" | "medium" | "high" | null {
  if (!bgModel) return null;
  const target = bgModel.targetFuelRates.find((t) => t.category === category);
  if (target) return target.confidence;
  return null;
}
```

Note: `BGResponseModel` import already exists in this file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/fuelRate.test.ts`
Expected: 5 passing

- [ ] **Step 5: Commit**

```
feat: add getFuelConfidence to resolve model confidence per category
```

---

### Task 2: Attach confidence to AdaptationChange

**Files:**
- Modify: `lib/adaptPlan.ts`
- Modify: `lib/__tests__/adaptPlan.test.ts`

- [ ] **Step 1: Write failing tests for confidence on AdaptationChange**

Add these tests to the `adaptFuelRate` describe block in `lib/__tests__/adaptPlan.test.ts`:

```typescript
it("attaches low confidence when target has low confidence", () => {
  const lowTarget = { ...makeTarget("interval", 36), confidence: "low" as const };
  const bgModel = makeBGModel([lowTarget]);
  const { change } = adaptFuelRate(30, "interval", bgModel);

  expect(change).not.toBeNull();
  expect(change!.confidence).toBe("low");
});

it("attaches medium confidence when target has medium confidence", () => {
  const bgModel = makeBGModel([makeTarget("interval", 36)]); // makeTarget defaults to "medium"
  const { change } = adaptFuelRate(30, "interval", bgModel);

  expect(change).not.toBeNull();
  expect(change!.confidence).toBe("medium");
});

it("omits confidence when fuel comes from category avg (no target)", () => {
  const bgModel = makeBGModel(); // no targets, falls back to avgFuelRate
  const { change } = adaptFuelRate(35, "interval", bgModel);

  expect(change).not.toBeNull();
  expect(change!.confidence).toBeUndefined();
});
```

Add this test to the `shouldSwapToEasy` describe block:

```typescript
it("does not attach confidence to swap changes", () => {
  const insights = makeInsights({ currentTsb: -25 });
  const events = [makeEvent({ fuelRate: 30 })];
  const bgModel = makeBGModel([makeTarget("interval", 36)]);

  const result = applyAdaptations({
    upcomingEvents: events,
    bgModel,
    insights,
    runBGContexts: {},
    lthr: 168,
    hrZones: [...TEST_HR_ZONES],
  });

  const swapChange = result[0].changes.find((c) => c.type === "swap");
  expect(swapChange).toBeDefined();
  expect(swapChange!.confidence).toBeUndefined();
});
```

Also add to the `applyAdaptations` describe block:

```typescript
it("propagates confidence from fuel change to adapted event", () => {
  const lowTarget = { ...makeTarget("interval", 36), confidence: "low" as const };
  const events = [makeEvent({ fuelRate: 30 })];
  const bgModel = makeBGModel([lowTarget]);
  const insights = makeInsights();

  const result = applyAdaptations({
    upcomingEvents: events,
    bgModel,
    insights,
    runBGContexts: {},
    lthr: 168,
    hrZones: [...TEST_HR_ZONES],
  });

  const fuelChange = result[0].changes.find((c) => c.type === "fuel");
  expect(fuelChange?.confidence).toBe("low");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/__tests__/adaptPlan.test.ts`
Expected: FAIL — `confidence` property doesn't exist on `AdaptationChange`

- [ ] **Step 3: Implement confidence on AdaptationChange and adaptFuelRate**

In `lib/adaptPlan.ts`:

1. Add `confidence` to `AdaptationChange`:

```typescript
export interface AdaptationChange {
  type: "fuel" | "swap";
  detail: string;
  confidence?: "low" | "medium" | "high";
}
```

2. Import `getFuelConfidence` at top:

```typescript
import { getCurrentFuelRate, getFuelConfidence } from "./fuelRate";
```

3. In `adaptFuelRate`, after resolving the rate, look up confidence and attach it to the change. Update the function signature to also accept `bgModel` directly (it already receives it):

The function already receives `bgModel`. Add confidence to changes:

```typescript
export function adaptFuelRate(
  current: number | null,
  category: WorkoutCategory | "race" | "other",
  bgModel: BGResponseModel,
): { rate: number | null; change: AdaptationChange | null } {
  if (category === "race" || category === "other") {
    return { rate: current, change: null };
  }

  const resolved = getCurrentFuelRate(category, bgModel);
  const confidence = getFuelConfidence(category, bgModel) ?? undefined;

  if (current != null && resolved !== current && Math.abs(resolved - current) >= 3) {
    return {
      rate: resolved,
      change: {
        type: "fuel",
        detail: `Fuel: ${current} → ${resolved} g/h (BG model target)`,
        confidence,
      },
    };
  }
  if (current == null) {
    return {
      rate: resolved,
      change: {
        type: "fuel",
        detail: `Fuel: set to ${resolved} g/h (BG model target)`,
        confidence,
      },
    };
  }
  return { rate: resolved, change: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/adaptPlan.test.ts`
Expected: All passing (existing + 4 new)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: 981+ tests passing, 0 failures

- [ ] **Step 6: Commit**

```
feat: attach BG model confidence to fuel adaptation changes
```

---

## Chunk 2: Frontend — Suggestion badge, checkbox, selective sync

### Task 3: PlannerScreen confidence-gated UI

**Files:**
- Modify: `app/screens/PlannerScreen.tsx`

- [ ] **Step 1: Add opt-in state**

Add state for tracking which low-confidence events the user has opted in. After the existing `syncDone` state (line 58):

```typescript
const [optedIn, setOptedIn] = useState<Record<string, boolean>>({});
```

Key is `event.original.id`. Reset it when `adaptedEvents` changes — add to `handleAdapt` success path after `setAdaptedEvents(data.adaptedEvents)`:

```typescript
setOptedIn({});
```

- [ ] **Step 2: Add helper to check if an event has a low-confidence fuel change**

Add a helper function inside the component (before the return):

```typescript
const hasLowConfidenceFuel = (event: AdaptedEvent) =>
  event.changes.some((c) => c.type === "fuel" && c.confidence === "low");
```

- [ ] **Step 3: Update preview card badges**

In the change badge rendering (around line 301-312), update to show "Suggestion" styling for low-confidence fuel changes:

Replace the badge `<span>` with logic that checks confidence:

```typescript
{event.changes.map((change, j) => {
  const isLowConfidence = change.type === "fuel" && change.confidence === "low";
  return (
    <span
      key={j}
      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
        isLowConfidence
          ? "bg-[#f59e0b]/20 text-[#f59e0b] border border-dashed border-[#f59e0b]/30"
          : change.type === "fuel"
            ? "bg-[#ff2d95]/20 text-[#ff2d95] border border-[#ff2d95]/30"
            : "bg-[#00ffff]/20 text-[#00ffff] border border-[#00ffff]/30"
      }`}
    >
      {isLowConfidence ? "Suggestion" : change.type === "fuel" ? "Fuel" : "Swap"}
    </span>
  );
})}
```

- [ ] **Step 4: Add per-event opt-in checkbox for low-confidence events**

After the change badges, inside the flex wrapper (the `div` with `className="flex items-center gap-2 flex-wrap"`), add:

```typescript
{hasLowConfidenceFuel(event) && (
  <label className="flex items-center gap-1 text-[10px] text-[#f59e0b] ml-auto cursor-pointer">
    <input
      type="checkbox"
      checked={optedIn[event.original.id] ?? false}
      onChange={(e) =>
        setOptedIn((prev) => ({ ...prev, [event.original.id]: e.target.checked }))
      }
      className="accent-[#f59e0b] w-3 h-3"
    />
    Include
  </label>
)}
```

- [ ] **Step 5: Update handleSync with confidence gating**

Replace `handleSync` (lines 183-214) with selective sync logic:

```typescript
const handleSync = async () => {
  if (!apiKey) {
    setAdaptStatus("Missing API Key");
    return;
  }

  const syncable = adaptedEvents.filter((e) => e.original.id.startsWith("event-"));
  if (syncable.length === 0) {
    setAdaptStatus("No events to sync");
    return;
  }

  // Filter out events with only low-confidence fuel changes that aren't opted in
  const toSync = syncable.filter((e) => {
    const isLowFuel = hasLowConfidenceFuel(e);
    const isOptedIn = optedIn[e.original.id] ?? false;
    const hasSwap = e.changes.some((c) => c.type === "swap");
    return !(isLowFuel && !isOptedIn && !hasSwap);
  });

  if (toSync.length === 0) {
    setAdaptStatus("No events to sync (all suggestions excluded)");
    return;
  }

  setIsSyncing(true);
  try {
    await Promise.all(
      toSync.map((e) => {
        const eventId = Number(e.original.id.replace("event-", ""));
        const isLowFuel = hasLowConfidenceFuel(e);
        const isOptedIn = optedIn[e.original.id] ?? false;
        // Revert to original fuel if low-confidence and not opted in (swap-only sync)
        const fuelRate = isLowFuel && !isOptedIn ? e.original.fuelRate : e.fuelRate;

        return updateEvent(apiKey, eventId, {
          description: e.description,
          ...(fuelRate != null && { carbs_per_hour: Math.round(fuelRate) }),
        });
      }),
    );
    setAdaptStatus(`Synced ${toSync.length} workouts to Intervals.icu`);
    setSyncDone(true);
    calendarReload();
  } catch (e) {
    setAdaptStatus(`Sync error: ${e instanceof Error ? e.message : String(e)}`);
  }
  setIsSyncing(false);
};
```

- [ ] **Step 6: Run full test suite and lint**

Run: `npm test && npm run lint`
Expected: All passing, no lint errors

- [ ] **Step 7: Manual verification**

Run: `npm run dev`
Verify in browser:
1. Click "Adapt" — preview cards should render
2. If any fuel changes have low confidence, they should show yellow dashed "Suggestion" badge with unchecked "Include" checkbox
3. Click "Sync Changes" without checking — low-confidence events should be excluded
4. Check an "Include" checkbox, sync again — that event should now be included

- [ ] **Step 8: Commit**

```
feat: gate fuel auto-sync on BG model confidence

Low-confidence fuel rate suggestions shown with "Suggestion" badge
and per-event opt-in checkbox. Excluded from sync by default.
Mixed swap+low-confidence events sync the swap with original fuel rate.
```
