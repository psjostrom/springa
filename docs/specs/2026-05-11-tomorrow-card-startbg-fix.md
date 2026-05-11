# Tomorrow card: stop using current BG as predicted start

**Date:** 2026-05-11
**Status:** Spec
**Related:** `docs/specs/2026-05-10-bg-fuel-trust-redesign-design.md` (PR #192)

## Problem

The Tomorrow card on the Intel tab is a planning view for the *next* planned run — usually 12–24 hours out. It currently seeds its matching engine with the runner's *current* CGM reading as the "predicted start BG" of that future run.

That assumption is wrong: tomorrow's start BG has no causal link to right-now's BG. The runner's BG before tomorrow's 12:00 run is determined by tomorrow's sleep, breakfast, IOB, and basal — not by what the sensor reads today at 15:19.

This causes two visible failures:

1. **Misleading framing.** The card says `current BG 5.9` in the header and `Predicted end BG · starting at 5.9` on the ribbon. Both imply 5.9 is an input to the prediction. It isn't — it's a coincidence.
2. **Match-set instability across CGM ticks.** `findMatchingRuns` filters past runs to those that started within ±2.0 mmol/L of the target startBG. A 0.2 mmol/L tick (5.9 → 6.1) flips the match set entirely:
   - At 5.9: 10 runs survive the filter (relaxed to category-only), 4 of them logged at 62 g/h → recommendation: **62 g/h**.
   - At 6.1: 6 *different* runs survive (full predictor set holds), but all 6 happen to have `fuelRate == null`. `recommendFuelRate` finds no fuel data → **"No fuel rate recorded for these matches"**.

   The same tomorrow card, same data, same workout, with a 5-minute CGM tick in between, swings from "62 g/h, evidence-backed" to "no recommendation". `lib/matchingRuns.ts:36–38` treats `run.fuelRate == null` as a pass through the fuelRate window, so null-fuel runs get pulled in as soon as the BG window narrows the rest away.

Both issues collapse to one root cause: **startBG should not be a matching predictor for a run that's hours-to-days away**.

## Fix

Drop startBG from the tomorrow-card matching predictor set. The Tomorrow card stops referencing live BG anywhere — it's a planning view, not a pre-run readiness view. Live BG continues to live where it belongs (topbar, prerun screen).

### API: nullable `startBG`, consistent with `fuelRate`

`MatchTarget.fuelRate` is already `number | null`, where null means "skip this filter" (`lib/matchingRuns.ts:40–42`). Apply the same shape to `startBG`:

```ts
export interface MatchTarget {
  category: WorkoutCategory;
  startBG: number | null;       // was: number
  fuelRate: number | null;
  hourOfDay: number;
  entrySlope?: number | null;
}
```

`inWindow` for `startBG` short-circuits to `true` when `target.startBG == null` — same pattern as `fuelRate`.

### Predictor list must reflect what was actually applied

After making `startBG` nullable, `findMatchingRuns` would still return `startBG` in `usedPredictors` (it comes from `rankPredictors` regardless of target value). The UI then says "Matched on similar starting BG…" when no startBG filter ran — false.

Fix: in `findMatchingRuns`, filter `startBG` out of the candidate `usedPredictors` list when `target.startBG == null`. Surgical — only `startBG`, only when null. Don't touch `fuelRate`/`entrySlope` here; those targets are not null in any current caller.

### Scope of change — file by file

**`lib/matchingRuns.ts`**
- `MatchTarget.startBG: number | null` (from `number`).
- `inWindow` for `startBG`: short-circuit `return true` when `target.startBG == null`.
- `findMatchingRuns`: after computing `usedPredictors` from `ranked`, drop `"startBG"` from the list when `target.startBG == null`.

**`lib/intelScreenData.ts`**
- Delete the `FALLBACK_START_BG = 8.0` constant.
- `buildTomorrow`: pass `startBG: null` in `target`. Stop computing `currentBGSource`. Stop reading `currentBG`.
- `TomorrowData` interface: drop `currentBG` and `currentBGSource` fields.
- `buildTomorrowData` signature: drop the `currentBG: number | null` parameter.
- `buildIntelScreenData` signature: drop the `currentBG: number | null` parameter.

**`app/components/TomorrowCard.tsx`**
- `Props`: drop `currentBG`, `currentBGSource`.
- Delete `FALLBACK_START_BG` constant, `liveBG` derivation, `ribbonStartBG`, `bgMeta`.
- Header line: remove the `· ${bgMeta}` segment. Header becomes `~{durationMin} min · {distanceKm} km · target HR {targetHRRange}`.
- Ribbon label for during phase: change from `Predicted end BG · starting at ${ribbonStartBG.toFixed(1)}` to:
  - `Predicted end BG · typical ${WORKOUT_CATEGORY_LABEL[workout.category]} at ${recommendation.fuelRate} g/h` when `recommendation != null`.
  - `Predicted end BG · typical ${WORKOUT_CATEGORY_LABEL[workout.category]}` when `recommendation == null`.

**`app/screens/IntelScreen.tsx`**
- Drop `currentBGAtom` from imports.
- Drop `const currentBG = useAtomValue(currentBGAtom);` (line 198).
- `buildTomorrowData(cachedActivities, events, settings ?? {})` — drop the `currentBG` argument and the `currentBG` `useMemo` dependency.

### What we're NOT changing

- `findMatchingRuns` startBG predictor logic itself — still useful for *historical* analysis where the start BG is known.
- `predictorImportance` / `rankPredictors` — these still rank startBG; we just don't apply its window when the target value is null.
- `recommendFuelRate` — works correctly given a stable match set.
- `DuringPatternCards` / `AfterPatternCards` (history-side) — they don't use currentBG at all.
- The pre-run readiness card / topbar / `useCurrentBG` — those legitimately use live BG and stay as-is.
- The `fuelRate`/`entrySlope` predictor entries in `usedPredictors` — same latent inconsistency exists, but no current caller passes null for those, so nothing is broken in practice. Leave alone.

## Acceptance criteria

1. Tomorrow card shows the same matched runs and same fuel recommendation regardless of `currentBG`. Reloading mid-CGM-tick does not change the displayed recommendation, count, or match list.
2. The strings `current BG`, `starting at`, and `matching against typical 8.0` no longer appear on the Tomorrow card.
3. Ribbon label reads `Predicted end BG · typical Easy at 62 g/h` (or `· typical Long at 50 g/h`, etc.) when a recommendation exists, and `Predicted end BG · typical Easy` when it doesn't.
4. `IntelScreen` no longer subscribes to `currentBGAtom`.
5. With the typical match set for a runner with 38 logged easy runs and ≥4 of them carrying fuel data, `recommendFuelRate` returns a fuel rate (not null).
6. `findMatchingRuns` returns `usedPredictors` without `"startBG"` when `target.startBG == null`.

## Test changes

**`lib/__tests__/matchingRuns.test.ts`**
- New: `treats target.startBG === null as 'skip startBG filter'`. Build target with `startBG: null` and runs spread across BG values; assert all category runs survive the BG filter.
- New: `omits startBG from usedPredictors when target.startBG is null`. Build target with `startBG: null`; assert `result.usedPredictors` does not contain `"startBG"`.

**`lib/__tests__/intelScreenData.test.ts`**
- Update the main shape test (line 30): drop the assertions on `result.tomorrow?.currentBG` and `result.tomorrow?.currentBGSource` (lines 162–163). Update `buildIntelScreenData(...)` call to drop the `7.5` currentBG arg.
- New: `tomorrow data is identical for two different currentBG inputs at construction time` — since `currentBG` is gone from the signature, this becomes "tomorrow data does not depend on a currentBG input": construct `buildTomorrowData` twice from the same inputs and assert deep equality, plus assert no `currentBG` field on the result.
- Delete: the `flags currentBGSource as fallback…` test (lines 212–229). The behavior is removed.

**`app/components/__tests__/TomorrowCard.integration.test.tsx`**
- Update the `sample` fixture: drop `currentBG: 8.5` and `currentBGSource: "live"`.
- Update `renders workout name, recommended fuel, predicted end BG range`: must not assert on any "current BG" or "starting at" string.
- New: ribbon label for during phase contains `typical Interval at 60 g/h` (or matching category/rate).
- New: ribbon label for during phase contains `typical Interval` (no `g/h` segment) when `recommendation` is null.
- Delete: `renders fallback BG label when no live reading is available` (lines 119–123).

## Out of scope

- A separate "imminent run" card that *does* use live BG (e.g., for runs within 2h). Possible follow-up; not needed to fix the reported bugs.
- Reworking `findMatchingRuns` API beyond making `startBG` nullable.
- Touching the pre-run readiness card or topbar BG display.
- Generalizing the "filter null-target predictor from usedPredictors" pattern to `fuelRate` or `entrySlope` — same latent issue, no manifest bug.
