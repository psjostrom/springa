import type { CalendarEvent } from "./types";
import type { RunBGContext } from "./runBGContext";
import { BG_HYPO } from "./constants";

// --- Types ---

export type Rating = "good" | "ok" | "bad";

export interface BGScore {
  rating: Rating;
  startBG: number;
  minBG: number;
  hypo: boolean;
  dropRate: number; // mmol/L per 10 min (negative = dropping)
}

export interface HRZoneScore {
  rating: Rating;
  targetZone: string; // e.g. "Z2", "Z4"
  pctInTarget: number; // 0-100
}

export interface FuelScore {
  rating: Rating;
  actual: number;
  planned: number;
  pct: number; // 0-100+
}

export interface EntryTrendScore {
  rating: Rating;
  slope30m: number; // mmol/L per 10min
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
  fuel: FuelScore | null;
  entryTrend: EntryTrendScore | null;
  recovery: RecoveryScore | null;
}

// --- Scoring Functions ---

export function scoreBG(event: CalendarEvent): BGScore | null {
  const glucose = event.streamData?.glucose;
  if (!glucose || glucose.length < 2) return null;

  const startBG = glucose[0].value;
  const lastBG = glucose[glucose.length - 1].value;
  const minBG = Math.min(...glucose.map((p) => p.value));
  const hypo = glucose.some((p) => p.value < BG_HYPO);

  // Duration in 10-min units (time is in seconds)
  const durationSec = glucose[glucose.length - 1].time - glucose[0].time;
  const duration10m = durationSec / 600;
  const dropRate = duration10m > 0 ? (lastBG - startBG) / duration10m : 0;

  let rating: Rating;
  if (hypo || dropRate < -2.0) {
    rating = "bad";
  } else if (dropRate < -1.0) {
    rating = "ok";
  } else {
    rating = "good";
  }

  return { rating, startBG, minBG, hypo, dropRate };
}

export function scoreHRZone(event: CalendarEvent): HRZoneScore | null {
  if (!event.hrZones) return null;

  const { z1, z2, z3, z4, z5 } = event.hrZones;
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
    targetSeconds = z4;
    targetZone = "Z4";
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

  return { rating, targetZone, pctInTarget };
}

export function scoreFuel(event: CalendarEvent): FuelScore | null {
  const actual = event.carbsIngested;
  const planned = event.totalCarbs;

  if (actual == null || planned == null || planned === 0) return null;

  const pct = (actual / planned) * 100;

  let rating: Rating;
  if (pct >= 80 && pct <= 120) {
    rating = "good";
  } else if (pct >= 60 && pct <= 150) {
    rating = "ok";
  } else {
    rating = "bad";
  }

  return { rating, actual, planned, pct };
}

export function scoreEntryTrend(ctx: RunBGContext | null | undefined): EntryTrendScore | null {
  if (!ctx?.pre) return null;

  const { entrySlope30m: slope, entryStability: stability } = ctx.pre;

  // Bad: crashing or volatile
  if (slope < -1.0) {
    return { rating: "bad", slope30m: slope, stability, label: "Crashing" };
  }
  if (stability > 1.5) {
    return { rating: "bad", slope30m: slope, stability, label: "Volatile" };
  }

  // Good: stable
  if (Math.abs(slope) <= 0.3 && stability < 0.5) {
    return { rating: "good", slope30m: slope, stability, label: "Stable" };
  }

  // Ok: mild drop, rise, or unsteady
  let label: string;
  if (slope < -0.3) label = "Dropping";
  else if (slope > 0.3) label = "Rising";
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
): ReportCard {
  return {
    bg: scoreBG(event),
    hrZone: scoreHRZone(event),
    fuel: scoreFuel(event),
    entryTrend: scoreEntryTrend(runBGContext),
    recovery: scoreRecovery(runBGContext),
  };
}
