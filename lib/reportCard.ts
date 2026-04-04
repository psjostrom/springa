import type { CalendarEvent, DataPoint } from "./types";
import type { RunBGContext } from "./runBGContext";
import { BG_HYPO } from "./constants";

// --- Types ---

export type Rating = "good" | "ok" | "bad";

export interface BGScore {
  rating: Rating;
  startBG: number;
  minBG: number;
  hypo: boolean;
  worstRate: number; // steepest 5-min drop rate, mmol/L per min (negative = dropping)
  lbgi: number; // Kovatchev Low BG Index for exercise window
}

export interface HRZoneScore {
  rating: Rating;
  targetZone: string; // e.g. "Z2", "Z4"
  pctInTarget: number; // 0-100 — for intervals: % of expected rep time spent in target zone
  zoneTimes?: { z1: number; z2: number; z3: number; z4: number; z5: number };
  expectedRepSec?: number; // intervals only: total expected rep time in seconds
}

export interface EntryTrendScore {
  rating: Rating;
  slope30m: number; // mmol/L per min
  stability: number; // std dev
  label: string; // "Stable" | "Dropping" | "Rising" | "Crashing" | "Volatile"
}

export interface RecoveryScore {
  rating: Rating;
  drop30m: number;
  nadir: number;
  postHypo: boolean;
  label: string; // "Clean" | "Dipping" | "Crashed"
}

export interface ReportCard {
  bg: BGScore | null;
  hrZone: HRZoneScore | null;
  entryTrend: EntryTrendScore | null;
  recovery: RecoveryScore | null;
}

// --- Description Parsing ---

/** Parse expected rep time from structured workout descriptions.
 *  E.g. "Main set 4x\n- 4m 89-99% LTHR" → { totalRepSec: 960, targetZone: "Z4" } */
export function parseExpectedRepTime(description: string): {
  repCount: number;
  repDurationSec: number;
  totalRepSec: number;
  targetZone: "Z4" | "Z5";
} | null {
  const headerMatch = /^(?:Main set|Strides)\s+(\d+)x\s*$/m.exec(description);
  if (!headerMatch) return null;

  const repCount = parseInt(headerMatch[1], 10);
  const afterHeader = description.slice(
    description.indexOf(headerMatch[0]) + headerMatch[0].length,
  );

  // First step after header is the hard effort: "- (Uphill )?2m 89-99% LTHR" or "- 20s 99-111% LTHR"
  const stepMatch = /^-\s+(?:Uphill\s+)?(\d+)(m|s)\s+(\d+)-\d+%\s+LTHR/m.exec(afterHeader);
  if (!stepMatch) return null;

  const duration = parseInt(stepMatch[1], 10);
  const unit = stepMatch[2];
  const minPct = parseInt(stepMatch[3], 10);

  const repDurationSec = unit === "m" ? duration * 60 : duration;
  const totalRepSec = repCount * repDurationSec;
  const targetZone: "Z4" | "Z5" = minPct >= 99 ? "Z5" : "Z4";

  return { repCount, repDurationSec, totalRepSec, targetZone };
}

// --- Kovatchev Risk Function (LBGI) ---
// Kovatchev et al. 1997 — symmetrizes the glucose scale and applies
// a quadratic risk function that weights proximity to hypoglycemia
// exponentially. Validated predictor of severe hypoglycemia risk.

const MMOL_TO_MGDL = 18.0182;

/** Per-reading low BG risk (Kovatchev). Returns 0 for readings above ~6.25 mmol/L. */
export function kovatchevLowRisk(bgMmol: number): number {
  const bgMgdl = bgMmol * MMOL_TO_MGDL;
  if (bgMgdl <= 0) return 0;
  const f = 1.509 * (Math.pow(Math.log(bgMgdl), 1.084) - 5.381);
  return f < 0 ? 10 * f * f : 0;
}

/** Compute LBGI (mean low risk) over a glucose trace. */
export function computeLBGI(glucose: DataPoint[]): number {
  if (glucose.length === 0) return 0;
  let sum = 0;
  for (const p of glucose) {
    sum += kovatchevLowRisk(p.value);
  }
  return sum / glucose.length;
}

// --- Worst Rate (steepest short-term drop) ---
// Uses EASD CGM arrow thresholds for interpretation:
//   >= -0.06: stable    -0.06 to -0.11: falling
//   -0.11 to -0.17: dropping    < -0.17: crashing

const WORST_RATE_WINDOW_MIN = 3;
const WORST_RATE_WINDOW_MAX = 7;

/** Find the steepest sustained drop rate over a ~5-min sliding window. */
export function computeWorstRate(glucose: DataPoint[]): number {
  if (glucose.length < 2) return 0;

  let worstRate = 0;
  let found = false;

  for (let i = 0; i < glucose.length; i++) {
    for (let j = i + 1; j < glucose.length; j++) {
      const dt = glucose[j].time - glucose[i].time;
      if (dt < WORST_RATE_WINDOW_MIN) continue;
      if (dt > WORST_RATE_WINDOW_MAX) break;

      const rate = (glucose[j].value - glucose[i].value) / dt;
      if (rate < worstRate) worstRate = rate;
      found = true;
    }
  }

  // Fallback for very short traces where no pair spans 3-7 min
  if (!found) {
    const dt = glucose[glucose.length - 1].time - glucose[0].time;
    if (dt > 0) {
      const startVal = glucose[0].value;
      const minVal = Math.min(...glucose.map((p) => p.value));
      worstRate = (minVal - startVal) / dt;
    }
  }

  return worstRate;
}

// --- BG Scoring ---
// Combines two validated frameworks:
// 1. Nadir (Kovatchev-inspired): where minBG landed relative to danger
// 2. Rate (EASD CGM thresholds): how fast the steepest drop was
//
// Nadir is the primary signal. Rate is a modifier that can downgrade
// but never upgrade. Matches GRI's 3-4x hypo weighting.

const NADIR_BAD = 4.5; // below this = one bad reading from clinical hypo (3.9)
const NADIR_OK = 6.0; // Per's comfort floor
const RATE_DROPPING = -0.11; // mmol/L per min — EASD "falling" → "dropping" boundary
const RATE_CRASHING = -0.17; // mmol/L per min — EASD "dropping" → "crashing" boundary

function downgrade(rating: Rating): Rating {
  if (rating === "good") return "ok";
  if (rating === "ok") return "bad";
  return "bad";
}

// --- Scoring Functions ---

export function scoreBG(event: CalendarEvent): BGScore | null {
  const glucose = event.glucose;
  if (!glucose || glucose.length < 2) return null;

  const startBG = glucose[0].value;
  const minBG = Math.min(...glucose.map((p) => p.value));
  const hypo = glucose.some((p) => p.value < BG_HYPO);
  const worstRate = computeWorstRate(glucose);
  const lbgi = computeLBGI(glucose);

  // Nadir-based rating (primary signal)
  let rating: Rating;
  if (minBG < NADIR_BAD) {
    rating = "bad";
  } else if (minBG < NADIR_OK) {
    rating = "ok";
  } else {
    rating = "good";
  }

  // Rate modifier (secondary signal, can only downgrade)
  if (worstRate < RATE_CRASHING) {
    // Crashing: always downgrade 1 step
    rating = downgrade(rating);
  } else if (worstRate < RATE_DROPPING) {
    // Dropping: downgrade if landing zone is also concerning
    if (minBG < NADIR_OK) {
      rating = downgrade(rating);
    } else {
      // High landing + moderate rate: downgrade good→ok only
      if (rating === "good") rating = "ok";
    }
  }

  return { rating, startBG, minBG, hypo, worstRate, lbgi };
}

export function scoreHRZone(event: CalendarEvent): HRZoneScore | null {
  if (!event.zoneTimes) return null;

  const { z1, z2, z3, z4, z5 } = event.zoneTimes;
  const total = z1 + z2 + z3 + z4 + z5;
  if (total === 0) return null;

  // Determine target zone based on category
  const cat = event.category;
  let targetSeconds: number;
  let targetZone: string;

  if (cat === "easy" || cat === "long") {
    targetSeconds = z2;
    targetZone = "Z2";
  } else if (cat === "interval") {
    // Score against expected rep time, not total workout time
    const repInfo = parseExpectedRepTime(event.description || "");
    if (!repInfo) return null;

    const actualRepSec = repInfo.targetZone === "Z5" ? z5 : z4;
    const compliance = (actualRepSec / repInfo.totalRepSec) * 100;

    let rating: Rating;
    if (compliance >= 60) rating = "good";
    else if (compliance >= 40) rating = "ok";
    else rating = "bad";

    return {
      rating,
      targetZone: repInfo.targetZone,
      pctInTarget: compliance,
      zoneTimes: { z1, z2, z3, z4, z5 },
      expectedRepSec: repInfo.totalRepSec,
    };
  } else {
    // race / other — use Z2+Z3 combined
    targetSeconds = z2 + z3;
    targetZone = "Z2–3";
  }

  const pctInTarget = (targetSeconds / total) * 100;

  let rating: Rating;
  if (pctInTarget >= 60) {
    rating = "good";
  } else if (pctInTarget >= 40) {
    rating = "ok";
  } else {
    rating = "bad";
  }

  return { rating, targetZone, pctInTarget, zoneTimes: { z1, z2, z3, z4, z5 } };
}

export function scoreEntryTrend(ctx: RunBGContext | null | undefined): EntryTrendScore | null {
  if (!ctx?.pre) return null;

  const { entrySlope30m: slope, entryStability: stability } = ctx.pre;

  // Bad: crashing or volatile
  if (slope < -0.1) {
    return { rating: "bad", slope30m: slope, stability, label: "Crashing" };
  }
  if (stability > 1.5) {
    return { rating: "bad", slope30m: slope, stability, label: "Volatile" };
  }

  // Good: stable
  if (Math.abs(slope) <= 0.03 && stability < 0.5) {
    return { rating: "good", slope30m: slope, stability, label: "Stable" };
  }

  // Ok: mild drop, rise, or unsteady
  let label: string;
  if (slope < -0.03) label = "Dropping";
  else if (slope > 0.03) label = "Rising";
  else label = "Unsteady";

  return { rating: "ok", slope30m: slope, stability, label };
}

export function scoreRecovery(ctx: RunBGContext | null | undefined): RecoveryScore | null {
  if (!ctx?.post) return null;

  const { recoveryDrop30m: drop30m, nadirPostRun: nadir, postRunHypo: postHypo } = ctx.post;

  // Bad: hypo, severe drop, or nadir at/below hypo threshold
  if (postHypo || drop30m < -2.0 || nadir <= BG_HYPO) {
    return { rating: "bad", drop30m, nadir, postHypo, label: "Crashed" };
  }

  // Good: clean recovery
  if (drop30m >= -1.0 && nadir > 4.5) {
    return { rating: "good", drop30m, nadir, postHypo, label: "Clean" };
  }

  // Ok: dipping
  return { rating: "ok", drop30m, nadir, postHypo, label: "Dipping" };
}

export function buildReportCard(
  event: CalendarEvent,
  runBGContext?: RunBGContext | null,
  sugarMode?: boolean,
): ReportCard {
  return {
    bg: sugarMode === false ? null : scoreBG(event),
    hrZone: scoreHRZone(event),
    entryTrend: sugarMode === false ? null : scoreEntryTrend(runBGContext),
    recovery: sugarMode === false ? null : scoreRecovery(runBGContext),
  };
}
