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

  for (let t = startTime; t <= endTime - WINDOW_SIZE; t++) {
    // Collect glucose values in this window
    let gStart: number | null = null;
    let gEnd: number | null = null;

    for (let m = t; m < t + WINDOW_SIZE; m++) {
      const g = gMap.get(m);
      if (g != null) {
        gStart ??= g;
        gEnd = g;
      }
    }

    // Need glucose at start and end of window
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
