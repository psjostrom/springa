import type { PaceTable, SpeedSessionType } from "./types";

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


/** LTHR zone boundaries as percentages. Used for HR-to-zone classification and color mapping. */
export const ZONE_THRESHOLDS = {
  z5: 99,  // >= 99% LTHR
  z4: 89,  // >= 89% LTHR
  z3: 78,  // >= 78% LTHR
  z2: 66,  // >= 66% LTHR
} as const;

/** HR zone bands as LTHR fractions. Single source of truth for workout generation. */
export const HR_ZONE_BANDS = {
  easy: { min: 0.66, max: 0.78 },
  steady: { min: 0.78, max: 0.89 },
  tempo: { min: 0.89, max: 0.99 },
  hard: { min: 0.99, max: 1.11 },
} as const;

import type { HRZoneName } from "./types";

/** Classify an LTHR percentage into a zone color. */
export function getZoneColor(lthrPercent: number): string {
  if (lthrPercent >= ZONE_THRESHOLDS.z5) return ZONE_COLORS.z5;
  if (lthrPercent >= ZONE_THRESHOLDS.z4) return ZONE_COLORS.z4;
  if (lthrPercent >= ZONE_THRESHOLDS.z3) return ZONE_COLORS.z3;
  if (lthrPercent >= ZONE_THRESHOLDS.z2) return ZONE_COLORS.z2;
  return ZONE_COLORS.z1;
}

/** Classify an LTHR percentage into a zone name. */
export function classifyZone(lthrPercent: number): HRZoneName {
  if (lthrPercent >= ZONE_THRESHOLDS.z5) return "hard";
  if (lthrPercent >= ZONE_THRESHOLDS.z4) return "tempo";
  if (lthrPercent >= ZONE_THRESHOLDS.z3) return "steady";
  return "easy";
}

/** Classify avgHr into a zone name based on LTHR ratio (Garmin LTHR zones) */
export function classifyHRZone(avgHr: number, lthr: number): HRZoneName {
  return classifyZone((avgHr / lthr) * 100);
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
  if (
    lowerName.includes("easy") ||
    lowerName.includes("bonus") ||
    lowerName.includes("strides")
  )
    return "easy";
  return "other";
}
