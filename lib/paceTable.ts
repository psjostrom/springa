import type { HRZoneName } from "./types";

const HM_DISTANCE_KM = 21.0975;

export interface PaceRange {
  min: number; // min/km (slower end)
  max: number; // min/km (faster end)
}

export interface PaceTableResult {
  easy: PaceRange;
  steady: PaceRange;
  tempo: PaceRange;
  hard: number;
  racePacePerKm: number;
  hmEquivalentPacePerKm: number;
  goalTimeSecs: number;
  distanceKm: number;
}

/**
 * Distance conversion factors for VDOT-style equivalency.
 * Converts any distance to HM-equivalent time: goalTime × factor ≈ HM time
 */
function getDistanceConversionFactor(distanceKm: number): number {
  if (distanceKm <= 5.5) return 4.65; // 5K
  if (distanceKm <= 11) return 2.10; // 10K
  if (distanceKm <= 22) return 1.0; // HM
  return 0.47; // Marathon
}

/**
 * Derive training paces from race distance and goal time.
 * Based on Ben Parkes' pace chart, using VDOT-style distance conversion.
 *
 * Pace ratios derived from Ben Parkes 2h20 HM row (validated across multiple goal times):
 * - Easy:     1.06-1.17× HM pace (slower)
 * - Steady:   0.98-1.01× actual race pace for goal distance
 * - Tempo:    0.90-0.94× HM pace (~5K effort)
 * - Hard:     0.85× HM pace (informational, strides are effort-based)
 */
export function getPaceTable(distanceKm: number, goalTimeSecs: number): PaceTableResult {
  const racePacePerKm = goalTimeSecs / 60 / distanceKm;

  // Convert to HM-equivalent time for zone calculations
  const conversionFactor = getDistanceConversionFactor(distanceKm);
  const hmEquivalentTimeSecs = goalTimeSecs * conversionFactor;
  const hmEquivalentPacePerKm = hmEquivalentTimeSecs / 60 / HM_DISTANCE_KM;

  return {
    easy: {
      min: hmEquivalentPacePerKm * 1.06,
      max: hmEquivalentPacePerKm * 1.17
    },
    steady: {
      min: racePacePerKm * 0.98,
      max: racePacePerKm * 1.01
    },
    tempo: {
      min: hmEquivalentPacePerKm * 0.90,
      max: hmEquivalentPacePerKm * 0.94
    },
    hard: hmEquivalentPacePerKm * 0.85,
    racePacePerKm,
    hmEquivalentPacePerKm,
    goalTimeSecs,
    distanceKm,
  };
}

export function estimateGoalTimeFromEasyPace(easyPaceMinPerKm: number): number {
  const racePace = easyPaceMinPerKm / 1.12;
  const rawSecs = racePace * HM_DISTANCE_KM * 60;
  return Math.round(rawSecs / 300) * 300;
}

export function getPaceRangeForZone(
  table: PaceTableResult,
  zone: HRZoneName,
): PaceRange | null {
  switch (zone) {
    case "easy": return table.easy;
    case "steady": return table.steady;
    case "tempo": return table.tempo;
    case "hard": return null;
  }
}
