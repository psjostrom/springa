# Pace Auto-Update — Status

**Branch:** `feat/pace-auto-update` (PR #155)
**Date:** 2026-04-13
**Spec:** `docs/specs/2026-04-13-pace-auto-update.md`

## Status: All signals implemented

### Signal priority order

1. **Race result** — completed race at matching distance (within 10%), improvement only. Direct comparison, no cap.
2. **PB calibration gap** — pace curve best effort vs predicted time. Fires only when trends are not regressing. Sliding threshold by PB age.
3. **Z4 pace trend** — slope over 90 days. Improvement: 10 sec/km. Regression: 15 sec/km. 2% cap.
4. **Cardiac cost trend** — temperature-corrected HR×pace product, 4-week windows. Improvement: >3% drop. Regression: >5% rise. 2% cap.

### Calibration gap: resolved

**Problem:** Z4-based calibration gap was unreliable for trail runners (terrain inflates Z4 pace → 4-8 min too slow estimates).

**Solution:** Replaced with PB-based calibration gap using `paceCurveData.bestEfforts` from Intervals.icu.

**How it works:**
1. Find best effort at reference distance (within 10% tolerance)
2. Check PB age is within 180 days
3. Only improvement direction (PB must be faster than predicted time)
4. Sliding threshold: PB age 0-90 days → 10% gap required. PB age 91-180 days → 20% gap required.
5. 30% cap on suggestion jump
6. Only fires when trend signals are not regressing (trends win when they disagree)

**Why sliding threshold:** Older PBs are less trustworthy. A runner who declined and accepted regression suggestions would have a stale PB — the 20% threshold for older PBs prevents false positives. Tested against 12 scenarios including post-decline plateau with stale PB.

**Decision matrix:**
- PB fires + trends improving → PB (bigger correction than 2% trend cap)
- PB fires + trends null → PB (the golden calibration gap case)
- PB fires + trends regressing → trends win (recent data overrides stale PB)
- PB null + trends fire → trends
- Nothing → null

### What's done

- Category detection fix (`categoryFromExternalId`) — 10 tests
- Z4 pace trend signal — tested
- Cardiac cost trend signal (temperature-corrected) — 4 tests
- PB calibration gap (sliding threshold) — 9 tests
- Race result signal (improvement only for distance match) — 4 tests
- Break detection (14+ day gap, 4 post-break minimum) — tested
- Confidence matrix (high/medium/null) — tested
- UI: PaceSuggestionCard (improvement, regression, race, PB variants) — 6 integration tests
- UI: PaceSuggestionBanner (bottom banner on non-Intel tabs)
- Accept flow (save → push threshold → regen plan → upload → calendar sync, with rollback)
- DB: `pace_suggestion_dismissed_at` column in production
- Atom: `paceSuggestionAtom` derived from calibration + settings + events + pace curve data
- Debug endpoint removed

### Test counts

- `lib/__tests__/paceInsight.test.ts` — 40 tests
- `app/components/__tests__/PaceSuggestionCard.integration.test.tsx` — 6 tests
- Full suite: 79/79 files, 1269/1269 tests pass. TypeScript clean. Lint clean.

## Key learnings

1. **Z4 pace is unreliable for absolute ability estimation on trail runners.** Terrain inflates pace at the same HR. Z4 works for *trends* (comparing to itself over time) but not for *calibration* (comparing to expected pace from ability settings).

2. **`currentAbilityDist` is in kilometers, not meters.** `CalendarEvent.distance` from Intervals.icu is in meters. Two bugs caught in review.

3. **Pace curve PB is the strongest calibration signal.** Direct measurement, no terrain bias (it's the fastest continuous effort at a given distance). Sliding threshold by age handles staleness.

## Files changed in PR

### New files
- `lib/paceInsight.ts` — all pace insight logic (category, temperature correction, cardiac cost, PB calibration gap, suggestion generation)
- `app/components/PaceSuggestionCard.tsx` — suggestion card UI
- `app/components/PaceSuggestionBanner.tsx` — calendar banner
- `app/components/__tests__/PaceSuggestionCard.integration.test.tsx`
- `app/components/__tests__/SettingsOverlay.integration.test.tsx`
- `lib/__tests__/paceInsight.test.ts`
- `docs/specs/2026-04-13-pace-auto-update-plan.md` (implementation plan)

### Modified files
- `lib/types.ts` — `external_id` on `IntervalsEvent`
- `lib/calendarPipeline.ts` — `categoryFromExternalId` wiring
- `lib/db.ts` — `pace_suggestion_dismissed_at` column
- `lib/settings.ts` — read/write `paceSuggestionDismissedAt`
- `lib/__tests__/setup-dom.ts` — `ArrowLeft` in lucide mock
- `app/atoms.ts` — `paceSuggestionAtom` + `paceCurveDataAtom` dependency
- `app/screens/IntelScreen.tsx` — card + accept handler
- `app/page.tsx` — banner
- `docs/specs/2026-04-13-pace-auto-update.md` — updated spec
