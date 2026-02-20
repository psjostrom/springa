import type { CalendarEvent } from "./types";

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

export interface ReportCard {
  bg: BGScore | null;
  hrZone: HRZoneScore | null;
  fuel: FuelScore | null;
}

// --- Scoring Functions ---

export function scoreBG(event: CalendarEvent): BGScore | null {
  const glucose = event.streamData?.glucose;
  if (!glucose || glucose.length < 2) return null;

  const startBG = glucose[0].value;
  const lastBG = glucose[glucose.length - 1].value;
  const minBG = Math.min(...glucose.map((p) => p.value));
  const hypo = glucose.some((p) => p.value < 3.9);

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

export function buildReportCard(event: CalendarEvent): ReportCard {
  return {
    bg: scoreBG(event),
    hrZone: scoreHRZone(event),
    fuel: scoreFuel(event),
  };
}
