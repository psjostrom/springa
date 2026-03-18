# BG Scoring Research & Implementation Notes

Session: 2026-03-17
PR: #72 (`fix/bg-score-nadir-rate`)
Branch: `fix/bg-score-nadir-rate`

## Problem

The old `scoreBG()` in `lib/reportCard.ts` used endpoint-to-endpoint slope:

```typescript
const dropRate = (lastBG - startBG) / durationMin;
```

This was blind to mid-run crashes. A run going 10→4→9 (crash + carb rescue) scored "good" because the endpoints were close. It also couldn't distinguish 14→10 (safe descent from high) from 9→5 (dangerous crash toward hypo) at the same rate.

## Research Findings

### Two validated clinical frameworks were identified:

#### 1. Kovatchev Risk Function (LBGI) — 1997

**Purpose:** Weights proximity to hypoglycemia exponentially. The glucose scale is asymmetric — the hypo range (1.1–3.9 mmol/L) is numerically narrow while hyper (10–33) is wide. Standard metrics like SD and mean are biased toward hyperglycemia.

**Formula:**
```
BG_mgdl = BG_mmol * 18.0182
f(BG) = 1.509 * (ln(BG_mgdl)^1.084 - 5.381)
rl(BG) = 10 * f(BG)^2   when f(BG) < 0, else 0
LBGI = mean of all rl(BG) values
```

**Key property:** The risk function returns 0 for readings above ~6.25 mmol/L. Below that, risk accelerates nonlinearly — each step closer to 3.9 carries exponentially more weight. A reading of 4.0 generates ~10x the risk of 5.5.

**Example values:**
- 10.0 mmol/L → risk = 0
- 8.0 mmol/L → risk = 0
- 6.0 mmol/L → risk ≈ 0.05
- 5.0 mmol/L → risk ≈ 1.7
- 4.0 mmol/L → risk ≈ 5.8
- 3.9 mmol/L → risk ≈ 7.6
- 3.0 mmol/L → risk ≈ 22.6

**Relevance to delta/arrows:** Not directly useful for rate-of-change arrows. LBGI is purely about absolute glucose position. However, it could be used to weight the *urgency* of an arrow — a falling arrow at 5.5 mmol/L is more dangerous than the same arrow at 12.0. Kovatchev gives a validated mathematical function for quantifying that difference.

**Citation:** Kovatchev BP, Cox DJ, Gonder-Frederick LA, Clarke WL. "Symmetrization of the blood glucose measurement scale and its applications." Diabetes Care 1997;20:1655-1658.

#### 2. EASD/ISPAD CGM Arrow Thresholds — 2020

**Purpose:** Standardized rate-of-change categories used by Dexcom and Libre for trend arrows.

**Thresholds (mmol/L per minute):**

| Rate | Direction | Arrow | Clinical meaning |
|------|-----------|-------|------------------|
| < -0.17 | Rapidly falling | ↓↓ | Stop exercise, take carbs immediately |
| -0.17 to -0.11 | Falling | ↓ | Act — carbs needed |
| -0.11 to -0.06 | Slowly falling | ↘ | Monitor closely |
| -0.06 to +0.06 | Stable | → | No concern |
| +0.06 to +0.11 | Slowly rising | ↗ | Monitor |
| +0.11 to +0.17 | Rising | ↑ | Consider action |
| > +0.17 | Rapidly rising | ↑↑ | Check for missed bolus |

**In mg/dL per minute:** multiply thresholds by 18 (so -0.11 mmol/L/min ≈ -2 mg/dL/min).

**Relevance to delta/arrows:** These ARE the standard arrow thresholds. If Springa computes its own direction from sgv values (which it does — `recomputeDirections()` in `lib/cgm.ts`), these thresholds should be used for the arrow classification. They're what Dexcom G6/G7 and Libre 3 use internally.

**Important note on sensor lag during exercise:** CGM readings lag actual blood glucose by 10–24 minutes during exercise (interstitial fluid delay). Clinical guidance is to act earlier (at higher glucose levels) during exercise because of this lag. The arrow might show "slowly falling" when blood glucose is already dropping faster.

**Citation:** Moser O, Riddell MC, Gal R, et al. "Glucose management for exercise using continuous glucose monitoring (CGM) and intermittently scanned CGM (isCGM) systems in type 1 diabetes: position statement of the European Association for the Study of Diabetes (EASD) and of the International Society for Pediatric and Adolescent Diabetes (ISPAD)." Diabetologia 2020;63:2501-2520.

### Additional Validated Metrics

#### GRI (Glycemia Risk Index) — 2022

The most modern composite glycemic score, validated by 330 T1D clinicians:

```
GRI = (3.0 * %time <3.0) + (2.4 * %time 3.0-3.9) + (1.6 * %time >13.9) + (0.8 * %time 10-13.9)
```

**Key insight:** Hypoglycemia is weighted 3-4x more heavily than equivalent hyperglycemia. This ratio was derived from clinical consensus (330 experts rating 225 CGM profiles), not arbitrary — it matches Per's intuition that "a drop to low levels is 3-4 times worse than high→high."

**Operates on time-in-range percentages**, not per-reading rates. Not directly applicable to per-run scoring, but validates the weighting approach.

#### Exercise-Specific Glucose Targets (EASD/ISPAD 2020 + Riddell 2017)

| Context | Target range |
|---------|-------------|
| During exercise (general) | 5.0–10.0 mmol/L |
| During prolonged aerobic | 7.0–10.0 mmol/L |
| Pre-exercise (aerobic >30min) | 7.0–10.0 mmol/L |
| Pre-exercise (HIIT/anaerobic) | 5.0–7.0 mmol/L |
| Stop exercise | < 3.9 mmol/L |
| Don't resume | < 3.0 mmol/L |
| Post-exercise monitoring | 4.4–10.0 mmol/L for 90 min |

#### EASD Pre-Exercise Action Matrix (Level x Trend → Action)

| Glucose | Falling ↓ | Stable → | Rising ↑ |
|---------|-----------|----------|----------|
| < 5.0 | 15-30g, delay | 15-30g, delay | 15-30g, delay |
| 5.0–6.9 | 15-25g carbs | 10-15g carbs | Start exercise |
| 7.0–10.0 | 10-15g carbs | Start exercise | Start exercise |
| > 10.0 | Start exercise | Start exercise | Start exercise |
| > 13.9 | Check ketones | Check ketones | Check ketones |

This matrix is the clinical validation that rate + absolute level interact multiplicatively — the same rate requires different actions depending on where glucose is.

#### CGM Alert Recommendations During Exercise

- Raise low alert to **5.0–5.6 mmol/L** during exercise (compensates for sensor lag)
- Use rate-of-change alerts at **-0.11 mmol/L/min** during exercise (Dexcom)
- Set high alert to **10.0 mmol/L** during exercise

## What PR #72 Implements

### New `scoreBG()` in `lib/reportCard.ts`

**Nadir-based rating (primary signal):**
- `minBG < 4.5` → bad (one bad reading from clinical hypo at 3.9)
- `minBG < 6.0` → ok (Per's comfort floor — "below 6 is too close")
- `minBG >= 6.0` → good

**Rate modifier (secondary, can only downgrade):**
- `worstRate < -0.17` (crashing) → downgrade 1 step (good→ok, ok→bad)
- `-0.17 <= worstRate < -0.11` (dropping) + `minBG < 6.0` → downgrade 1 step
- `-0.17 <= worstRate < -0.11` (dropping) + `minBG >= 6.0` → good→ok only
- `worstRate >= -0.11` → no change

### New helper functions (all exported, reusable)

- `kovatchevLowRisk(bgMmol: number): number` — per-reading low BG risk
- `computeLBGI(glucose: DataPoint[]): number` — mean low risk over a glucose trace
- `computeWorstRate(glucose: DataPoint[]): number` — steepest drop rate in any 3-7 min sliding window

### Updated `BGScore` interface

```typescript
interface BGScore {
  rating: Rating;        // "good" | "ok" | "bad"
  startBG: number;       // first glucose reading (mmol/L)
  minBG: number;         // lowest glucose reading (mmol/L)
  hypo: boolean;         // any reading < 3.9
  worstRate: number;     // steepest 5-min window drop (mmol/L/min, negative = dropping)
  lbgi: number;          // Kovatchev Low BG Index for exercise window
}
```

Old field `dropRate` (endpoint-to-endpoint slope) was removed and replaced by `worstRate`.

### Files changed

- `lib/reportCard.ts` — core scoring rewrite
- `app/components/RunReportCard.tsx` — UI labels now use EASD thresholds (Crashing/Dropping/Stable), popover shows LBGI
- `lib/bgPatterns.ts` — `bg.dropRate` → `bg.worstRate` (feeds AI pattern analysis)
- `lib/runAnalysisPrompt.ts` — "Drop rate" → "Worst drop rate" in AI prompts
- Tests updated with 23 new test cases

## Relevance for Delta/Arrow Computation

The EASD thresholds table above is the validated standard for CGM trend arrows. Key considerations for implementing arrows in Springa:

1. **Use the EASD thresholds** (-0.06, -0.11, -0.17 mmol/L/min) for arrow classification — they're what Dexcom and Libre use.

2. **`recomputeDirections()` in `lib/cgm.ts`** already recomputes direction from sgv values (because xDrip+ companion mode returns stale direction/delta fields). Check whether its thresholds match the EASD standard.

3. **Sensor lag matters for arrows** — CGM lags blood glucose by 10-24 min during exercise. An arrow showing "slowly falling" might understate the actual rate. Clinical guidance: act earlier during exercise.

4. **Kovatchev risk could weight arrow urgency** — a ↓ arrow at 5.5 mmol/L is clinically very different from ↓ at 12.0. The `kovatchevLowRisk()` function from PR #72 gives a validated way to quantify that difference. Could be used for alert prioritization or color coding.

5. **The `computeWorstRate()` function** uses 3-7 min sliding windows, which is the same timeframe CGM arrows use (~5 min). It could potentially be reused or adapted for real-time arrow computation, though it's currently designed for retrospective analysis of completed runs.

## Sources

- Kovatchev et al. 1997 — Symmetrization of the Blood Glucose Measurement Scale
- Moser et al. 2020 — EASD/ISPAD Position Statement: Glucose Management for Exercise Using CGM
- Riddell et al. 2017 — Exercise Management in T1D: A Consensus Statement (Lancet Diabetes & Endocrinology)
- Klonoff et al. 2022 — GRI: A Single-Number Composite Metric (validated by 330 clinicians)
- Battelino et al. 2019 — International Consensus on Time in Range
- T1DEXI Study 2025 — Hypoglycemia Risk During Real-World Physical Activity
