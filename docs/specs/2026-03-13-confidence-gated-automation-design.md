# Confidence-Gated Automation

## Problem

`getCurrentFuelRate()` returns BG model target fuel rates regardless of confidence level. A low-confidence target (< 10 observations) gets auto-synced to Intervals.icu identically to a high-confidence one. For a T1D runner, a wrong fuel rate before a long run could cause a hypo. The system should be more cautious when it knows less.

## Solution

Two-tier gate on the adapt pipeline:

- **Confident** (medium/high, >= 10 observations): auto-applied, included in sync. No behavior change from today.
- **Low confidence** (< 10 observations): shown in adapt preview as a suggestion with visual distinction. Excluded from sync by default. Per-event checkbox to opt in.

The gate applies only to fuel rate changes derived from `targetFuelRates`. Workout swaps (TSB/ramp-based) are always deterministic and unaffected.

## Data Flow

```
bgModel.targetFuelRates[].confidence
        |
        v
getCurrentFuelRate() -- unchanged, still resolves the value
getFuelConfidence()  -- NEW, resolves the confidence for that value
        |
        v
adaptFuelRate() -- attaches confidence to AdaptationChange
        |
        v
PlannerScreen preview -- low-confidence: "Suggestion" badge + unchecked checkbox
                      -- medium/high: normal badge, included in sync
        |
        v
handleSync() -- excludes low-confidence changes unless checkbox is checked
```

## Changes

### lib/fuelRate.ts

New export `getFuelConfidence()`:

```typescript
export function getFuelConfidence(
  category: WorkoutCategory,
  bgModel: BGResponseModel | null | undefined,
): "low" | "medium" | "high" | null {
  if (!bgModel) return null;
  const target = bgModel.targetFuelRates.find((t) => t.category === category);
  if (target) return target.confidence;
  return null; // fuel came from category avg or default, not model-derived
}
```

`getCurrentFuelRate()` is unchanged.

### lib/adaptPlan.ts

`AdaptationChange` gains an optional `confidence` field:

```typescript
export interface AdaptationChange {
  type: "fuel" | "swap";
  detail: string;
  confidence?: "low" | "medium" | "high";
}
```

`adaptFuelRate()` calls `getFuelConfidence()` and attaches it to the change when the fuel came from a model target.

### app/screens/PlannerScreen.tsx

Preview cards:
- Low-confidence fuel changes render with a "Suggestion" badge (yellow/dashed styling) and an unchecked checkbox.
- Medium/high fuel changes render as today (solid badge, always included in sync).

Sync handler:
- State: `Record<number, boolean>` tracking which low-confidence events the user has opted in.
- When syncing, each adapted event is classified:
  - **No low-confidence fuel change**: sync as-is (today's behavior).
  - **Low-confidence fuel change only, not opted in**: skip entirely (no sync for this event).
  - **Low-confidence fuel change only, opted in**: sync with the adapted fuel rate.
  - **Swap + low-confidence fuel, not opted in**: sync the swap but use `adapted.original.fuelRate` (revert fuel to pre-adaptation value).
  - **Swap + low-confidence fuel, opted in**: sync with both the swap and adapted fuel rate.

### No changes

- `lib/bgModel.ts` — confidence calculation is already correct.
- `lib/adaptPlanPrompt.ts` — already includes `target.confidence` in the AI prompt text.
- `app/components/BGResponsePanel.tsx` — Intel display is informational, existing confidence badge suffices.
- `app/api/adapt-plan/route.ts` — passes data through, no gating logic needed server-side.

## Testing

### Unit: lib/fuelRate.test.ts

- `getFuelConfidence()` returns the confidence from the matching targetFuelResult.
- Returns `null` when no target exists for the category.
- Returns `null` when bgModel is null/undefined.

### Unit: lib/adaptPlan.test.ts

- `adaptFuelRate()` attaches `confidence: "low"` when target has low confidence.
- `adaptFuelRate()` attaches `confidence: "medium"` or `"high"` for confident targets.
- `adaptFuelRate()` omits confidence when fuel comes from category avg (no target).
- No confidence field on swap changes.

### Integration: PlannerScreen

- Low-confidence fuel changes excluded from sync payload by default.
- Checking the opt-in checkbox includes the event in sync.
- Mixed event (swap + low-confidence fuel): swap syncs with original fuel rate when not opted in.
