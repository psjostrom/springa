import type { DataPoint } from "./types";
import type { WorkoutCategory } from "./types";

import type { BGObservation } from "./bgModel";

// --- Window constants ---

const WINDOW_SIZE = 5; // minutes
const SKIP_START = 5; // skip first 5 minutes
const SKIP_END = 2; // skip last 2 minutes

/** Minimum aligned data points needed for observation extraction. */
export const MIN_ALIGNED_POINTS = SKIP_START + WINDOW_SIZE + SKIP_END;

// --- Observation extraction ---

/** Extract BG observations from aligned HR + glucose streams. */
export function extractObservations(
  hr: DataPoint[],
  glucose: DataPoint[],
  activityId: string,
  fuelRate: number | null,
  startBG: number,
  category: WorkoutCategory,
  entrySlope?: number | null,
): BGObservation[] {
  if (hr.length < WINDOW_SIZE) return [];

  const observations: BGObservation[] = [];
  const startTime = hr[0].time + SKIP_START;
  const endTime = hr[hr.length - 1].time - SKIP_END;

  // Build lookup maps for fast access
  const gMap = new Map(glucose.map((p) => [p.time, p.value]));

  // Average glucose values within ±1 minute of a target minute
  const avgGlucose = (center: number) => {
    let sum = 0, count = 0;
    for (let m = center - 1; m <= center + 1; m++) {
      const g = gMap.get(m);
      if (g != null) { sum += g; count++; }
    }
    return count > 0 ? sum / count : null;
  };

  for (let t = startTime; t <= endTime - WINDOW_SIZE; t++) {
    // Find first and last minutes with glucose data in window
    let startMin: number | null = null;
    let endMin: number | null = null;
    for (let m = t; m < t + WINDOW_SIZE; m++) {
      if (gMap.has(m)) {
        startMin ??= m;
        endMin = m;
      }
    }
    if (startMin == null || endMin == null || startMin === endMin) continue;

    // Average ±1 minute at each boundary to reduce single-reading noise
    const gStart = avgGlucose(startMin);
    const gEnd = avgGlucose(endMin);
    if (gStart == null || gEnd == null) continue;

    // BG slope: (end - start) / windowMin → mmol/L per min
    const bgRate = (gEnd - gStart) / WINDOW_SIZE;

    observations.push({
      category,
      bgRate,
      fuelRate,
      activityId,
      timeMinute: t,
      startBG,
      relativeMinute: t - hr[0].time,
      entrySlope: entrySlope ?? null,
    });
  }

  return observations;
}
