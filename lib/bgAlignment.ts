import type { BGReading } from "./cgm";
import type { DataPoint } from "./types";
import type { CachedActivity } from "./activityStreamsDb";

/**
 * Interpolate BG at a specific timestamp using linear interpolation.
 * - Before first reading → returns first reading value
 * - After last reading → returns last reading value
 * - Between readings → linear interpolation
 *
 * @param readings - CGM readings sorted by timestamp
 * @param targetMs - target timestamp in milliseconds
 * @returns interpolated BG in mmol/L, or null if no readings available
 */
export function interpolateBG(
  readings: BGReading[],
  targetMs: number,
): number | null {
  if (readings.length === 0) return null;

  // Find the last reading at or before target
  let beforeIdx = -1;
  for (let i = readings.length - 1; i >= 0; i--) {
    if (readings[i].ts <= targetMs) {
      beforeIdx = i;
      break;
    }
  }

  // Before first reading — use first value
  if (beforeIdx === -1) {
    return readings[0].mmol;
  }

  const before = readings[beforeIdx];

  // Exact match or after last reading — use that value
  if (beforeIdx === readings.length - 1 || before.ts === targetMs) {
    return before.mmol;
  }

  // Linear interpolation between before and after
  const after = readings[beforeIdx + 1];
  const t = (targetMs - before.ts) / (after.ts - before.ts);
  return before.mmol + t * (after.mmol - before.mmol);
}

export interface AlignedRunData {
  hr: DataPoint[];
  glucose: DataPoint[];
}

/**
 * Align HR stream data with CGM readings using linear interpolation.
 *
 * For each HR data point (indexed by relative minutes from run start),
 * computes the interpolated BG value at that timestamp.
 *
 * @param hrPoints - HR data points with time in relative minutes from run start
 * @param readings - CGM readings with absolute timestamps (must be sorted by ts)
 * @param runStartMs - run start time in milliseconds
 * @returns aligned HR and glucose arrays
 */
export function alignHRWithBG(
  hrPoints: DataPoint[],
  readings: BGReading[],
  runStartMs: number,
): AlignedRunData | null {
  if (readings.length === 0 || hrPoints.length === 0) {
    return null;
  }

  const hr: DataPoint[] = [];
  const glucose: DataPoint[] = [];

  for (const hrPoint of hrPoints) {
    const targetMs = runStartMs + hrPoint.time * 60 * 1000;
    const bg = interpolateBG(readings, targetMs);

    if (bg !== null) {
      hr.push({ time: hrPoint.time, value: hrPoint.value });
      glucose.push({ time: hrPoint.time, value: bg });
    }
  }

  if (glucose.length === 0) {
    return null;
  }

  return { hr, glucose };
}

/**
 * Convert CGM readings to relative-minute DataPoints for a run.
 * Uses linear interpolation to create minute-by-minute values.
 *
 * @param readings - CGM readings with absolute timestamps (must be sorted by ts)
 * @param runStartMs - run start time in milliseconds
 * @param runEndMs - run end time in milliseconds
 * @returns glucose DataPoints with time in relative minutes
 */
export function bgToGlucosePoints(
  readings: BGReading[],
  runStartMs: number,
  runEndMs: number,
): DataPoint[] {
  if (readings.length === 0) return [];

  const durationMin = Math.ceil((runEndMs - runStartMs) / 60000);
  const points: DataPoint[] = [];

  for (let minute = 0; minute <= durationMin; minute++) {
    const targetMs = runStartMs + minute * 60 * 1000;
    const bg = interpolateBG(readings, targetMs);
    if (bg !== null) {
      points.push({ time: minute, value: bg });
    }
  }

  return points;
}

/**
 * Enrich CachedActivity array with glucose data from CGM readings.
 * For each activity with HR and runStartMs, aligns glucose via interpolation.
 */
export function enrichWithGlucose(
  activities: CachedActivity[],
  readings: BGReading[],
): CachedActivity[] {
  return activities.map((act) => {
    if (act.glucose && act.glucose.length > 0) return act;
    if (act.hr.length === 0 || !act.runStartMs || readings.length === 0) {
      return act;
    }
    const aligned = alignHRWithBG(act.hr, readings, act.runStartMs);
    if (!aligned) return act;
    return { ...act, glucose: aligned.glucose, hr: aligned.hr };
  });
}
