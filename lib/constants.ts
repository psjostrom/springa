import type { HRZoneName, PaceTable, SpeedSessionType } from "./types";

// --- CONSTANTS ---

/** Blood glucose thresholds (mmol/L) */
export const BG_HYPO = 3.9;
export const BG_STABLE_MIN = 4.0;
export const BG_STABLE_MAX = 10.0;
export const BG_HIGH = 14.0;
/** Minimum forecast BG during exercise before triggering caution (mmol/L). */
export const BG_EXERCISE_MIN = 5.5;

/** mg/dL → mmol/L conversion factor. */
export const MGDL_TO_MMOL = 18.018;

export const DEFAULT_LTHR = 168;
export const DEFAULT_MAX_HR = 189;
export const CRASH_DROP_RATE = -3.0;
export const SPIKE_RISE_RATE = 3.0;
export const DEFAULT_CARBS_G = 10;
export const API_BASE = "https://intervals.icu/api/v1";

/** Number of months to look back when fetching calendar data. */
export const CALENDAR_LOOKBACK_MONTHS = 24;
/** Default estimated duration (minutes) when workout parsing fails. */
export const DEFAULT_WORKOUT_DURATION_MINUTES = 45;
/** Number of days of activity history to analyze. */
export const ACTIVITY_HISTORY_DAYS = 45;

export const FALLBACK_PACE_TABLE: PaceTable = {
  easy: { zone: "easy", avgPace: 7.25, sampleCount: 0 },
  steady: { zone: "steady", avgPace: 5.67, sampleCount: 0 },
  tempo: { zone: "tempo", avgPace: 5.21, sampleCount: 0 },
  hard: { zone: "hard", avgPace: 4.75, sampleCount: 0 },
};

export const SPEED_ROTATION: SpeedSessionType[] = [
  "short-intervals",
  "hills",
  "long-intervals",
  "distance-intervals",
];

export const SPEED_SESSION_LABELS: Record<SpeedSessionType, string> = {
  "short-intervals": "Short Intervals",
  hills: "Hills",
  "long-intervals": "Long Intervals",
  "distance-intervals": "Distance Intervals",
  "race-pace-intervals": "Race Pace Intervals",
};

/** Zone colors used across the app (bars, badges, charts, breakdowns). */
export const ZONE_COLORS = {
  z1: "#6ee7b7",
  z2: "#06b6d4",
  z3: "#fbbf24",
  z4: "#fb923c",
  z5: "#ef4444",
} as const;

export type ZoneKey = keyof typeof ZONE_COLORS;

/** Map zone key to workout intensity name (for pace tables, workout descriptions). */
export const ZONE_TO_NAME: Record<ZoneKey, HRZoneName> = {
  z1: "easy",
  z2: "easy",
  z3: "steady",
  z4: "tempo",
  z5: "hard",
};

const HR_ZONE_INDEX: Record<HRZoneName, [number, number]> = {
  easy: [0, 1],
  steady: [1, 2],
  tempo: [2, 3],
  hard: [3, 4],
};

/**
 * Resolve zone boundaries as LTHR fractions from the Intervals.icu hrZones array.
 * hrZones = [Z1top, Z2top, Z3top, Z4top, Z5top] (BPM values synced from Garmin).
 */
export function resolveZoneBand(
  zone: HRZoneName,
  lthr: number,
  hrZones: number[],
): { min: number; max: number } {
  const [loIdx, hiIdx] = HR_ZONE_INDEX[zone];
  return { min: hrZones[loIdx] / lthr, max: hrZones[hiIdx] / lthr };
}

/**
 * Classify HR into a zone key using actual zone boundaries.
 * This is the ONE function for HR → zone classification.
 * hrZones = [Z1top, Z2top, Z3top, Z4top, Z5top] (BPM values from Intervals.icu/Garmin).
 */
export function classifyHR(hr: number, hrZones: number[]): ZoneKey {
  if (hr > hrZones[3]) return "z5";
  if (hr > hrZones[2]) return "z4";
  if (hr > hrZones[1]) return "z3";
  if (hr > hrZones[0]) return "z2";
  return "z1";
}

export function getWorkoutCategory(
  name: string,
): "long" | "interval" | "easy" | "other" {
  const lowerName = name.toLowerCase();
  // Check "interval" before "long" so "Long Intervals" → interval, not long
  if (
    lowerName.includes("interval") ||
    lowerName.includes("hills") ||
    lowerName.includes("tempo") ||
    lowerName.includes("race pace")
  )
    return "interval";
  if (lowerName.includes("long")) return "long";
  if (lowerName.includes("club")) return "interval";
  if (
    lowerName.includes("easy") ||
    lowerName.includes("bonus") ||
    lowerName.includes("strides")
  )
    return "easy";
  return "other";
}
