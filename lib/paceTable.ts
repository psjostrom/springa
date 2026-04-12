import type { ZoneName } from "./types";

const HM_DISTANCE_KM = 21.0975;

export type ExperienceLevel = "beginner" | "intermediate" | "experienced";

const STANDARD_DISTANCES: { km: number; defaults: Record<ExperienceLevel, number> }[] = [
  { km: 5, defaults: { beginner: 2100, intermediate: 1620, experienced: 1320 } },
  { km: 10, defaults: { beginner: 4320, intermediate: 3360, experienced: 2760 } },
  { km: 21.0975, defaults: { beginner: 9000, intermediate: 7500, experienced: 6300 } },
  { km: 42.195, defaults: { beginner: 18900, intermediate: 15300, experienced: 12600 } },
];

export const DISTANCE_OPTIONS = [
  { label: "5K", km: 5 },
  { label: "10K", km: 10 },
  { label: "Half", km: 21.0975 },
  { label: "Marathon", km: 42.195 },
] as const;

export interface PaceRange {
  min: number; // min/km (faster end — lower value)
  max: number; // min/km (slower end — higher value)
}

export interface PaceTableResult {
  z2: PaceRange;
  z3: PaceRange;
  z4: PaceRange;
  z5: number;
  racePacePerKm: number;          // ability pace at reference distance
  hmEquivalentPacePerKm: number;  // HM-equivalent for zone derivation
  abilitySecs: number;            // input ability time
  abilityDistKm: number;          // input ability distance
}

/** Convert a goal time at any distance to the equivalent HM time using
 *  the Riegel formula: T_hm = T × (21.0975 / D)^1.06.
 *  Produces continuous values that closely match known VDOT tables
 *  (5K→4.56×, 10K→2.24×, Marathon→0.48×). */
function getHmEquivalentTimeSecs(distanceKm: number, timeSecs: number): number {
  if (Math.abs(distanceKm - HM_DISTANCE_KM) < 0.5) return timeSecs;
  return timeSecs * Math.pow(HM_DISTANCE_KM / distanceKm, 1.06);
}

/**
 * Derive training paces from current ability (distance + time).
 * Based on Ben Parkes' pace chart, using VDOT-style distance conversion.
 *
 * Pace ratios derived from Ben Parkes 2h20 HM row (validated across multiple goal times):
 * - Easy:     1.06-1.17× HM pace (slower)
 * - Steady:   0.98-1.01× ability pace
 * - Tempo:    0.90-0.94× HM pace (~5K effort)
 * - Hard:     0.85× HM pace (informational, strides are effort-based)
 */
export function getPaceTable(
  abilityDistKm: number,
  abilitySecs: number,
): PaceTableResult {
  if (abilityDistKm <= 0 || abilitySecs <= 0) {
    throw new Error("Ability distance and time must be positive");
  }
  const abilityPacePerKm = abilitySecs / 60 / abilityDistKm;
  const hmEquivalentTimeSecs = getHmEquivalentTimeSecs(abilityDistKm, abilitySecs);
  const hmEquivalentPacePerKm = hmEquivalentTimeSecs / 60 / HM_DISTANCE_KM;

  return {
    z2: { min: hmEquivalentPacePerKm * 1.06, max: hmEquivalentPacePerKm * 1.17 },
    z3: { min: abilityPacePerKm * 0.98, max: abilityPacePerKm * 1.01 },
    z4: { min: hmEquivalentPacePerKm * 0.90, max: hmEquivalentPacePerKm * 0.94 },
    z5: hmEquivalentPacePerKm * 0.85,
    racePacePerKm: abilityPacePerKm,
    hmEquivalentPacePerKm,
    abilitySecs,
    abilityDistKm,
  };
}

/** Estimate HM goal time from an observed easy pace.
 *  Uses 1.12x multiplier (midpoint of Ben Parkes' easy-to-race-pace ratio 1.06-1.17).
 *  Result rounded to nearest 5 minutes for UI slider compatibility. */
export function estimateGoalTimeFromEasyPace(easyPaceMinPerKm: number): number {
  const hmRacePace = easyPaceMinPerKm / 1.12;
  const rawSecs = hmRacePace * HM_DISTANCE_KM * 60;
  return Math.round(rawSecs / 300) * 300;
}

export function getPaceRangeForZone(
  table: PaceTableResult,
  zone: ZoneName,
): PaceRange | null {
  switch (zone) {
    case "z1": return null;
    case "z2": return table.z2;
    case "z3": return table.z3;
    case "z4": return table.z4;
    case "z5": return null;
  }
}

/** Get default goal time for a distance and experience level.
 *  Interpolates linearly for custom distances between standard distances.
 *  Extrapolates proportionally for distances outside the standard range. */
export function getDefaultGoalTime(distanceKm: number, level: ExperienceLevel): number {
  const exact = STANDARD_DISTANCES.find((d) => Math.abs(d.km - distanceKm) < 0.5);
  if (exact) return exact.defaults[level];

  // Below minimum: scale proportionally from 5K
  if (distanceKm < STANDARD_DISTANCES[0].km) {
    const ratio = distanceKm / STANDARD_DISTANCES[0].km;
    return Math.round(STANDARD_DISTANCES[0].defaults[level] * ratio);
  }

  // Above maximum: scale proportionally from marathon
  const last = STANDARD_DISTANCES[STANDARD_DISTANCES.length - 1];
  if (distanceKm > last.km) {
    const ratio = distanceKm / last.km;
    return Math.round(last.defaults[level] * ratio);
  }

  // Between standard distances: linear interpolation
  let lower = STANDARD_DISTANCES[0];
  let upper = STANDARD_DISTANCES[STANDARD_DISTANCES.length - 1];
  for (let i = 0; i < STANDARD_DISTANCES.length - 1; i++) {
    if (distanceKm >= STANDARD_DISTANCES[i].km && distanceKm <= STANDARD_DISTANCES[i + 1].km) {
      lower = STANDARD_DISTANCES[i]; upper = STANDARD_DISTANCES[i + 1]; break;
    }
  }
  const fraction = (distanceKm - lower.km) / (upper.km - lower.km);
  return Math.round(lower.defaults[level] + (upper.defaults[level] - lower.defaults[level]) * fraction);
}

/** Get the threshold pace (HM-equivalent) from ability settings.
 *  Returns undefined if ability is not set. Used for workout display and pace zone analysis. */
export function getThresholdPace(abilityDistKm?: number, abilitySecs?: number): number | undefined {
  if (!abilityDistKm || !abilitySecs) return undefined;
  return getPaceTable(abilityDistKm, abilitySecs).hmEquivalentPacePerKm;
}

export function getSliderRange(distanceKm: number): { min: number; max: number; step: number } {
  const ranges: { maxKm: number; min: number; max: number; step: number }[] = [
    { maxKm: 5.5, min: 900, max: 2700, step: 60 },
    { maxKm: 11, min: 2100, max: 5400, step: 60 },
    { maxKm: 22, min: 4800, max: 11700, step: 300 },
    { maxKm: 50, min: 9900, max: 23400, step: 300 },
  ];
  for (const r of ranges) {
    if (distanceKm <= r.maxKm) return { min: r.min, max: r.max, step: r.step };
  }
  return ranges[ranges.length - 1];
}
