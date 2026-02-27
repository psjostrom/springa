import type { DataPoint, IntervalsStream } from "./types";
import type { WorkoutCategory } from "./types";
import { MGDL_TO_MMOL } from "./constants";

import type { BGObservation } from "./bgModel";

// --- Glucose conversion ---

/** Smart glucose conversion: converts mg/dL to mmol/L only when needed. */
export function convertGlucoseToMmol(values: number[]): number[] {
  if (values.length === 0) return values;

  const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
  const maxValue = Math.max(...values);

  const needsConversion = avgValue > 15 || maxValue > 20;

  if (needsConversion) {
    return values.map((v) => v / MGDL_TO_MMOL);
  }
  return values;
}

// --- Window constants ---

const WINDOW_SIZE = 5; // minutes
const SKIP_START = 5; // skip first 5 minutes
const SKIP_END = 2; // skip last 2 minutes

/** Minimum aligned data points needed for a valid alignment. */
export const MIN_ALIGNED_POINTS = SKIP_START + WINDOW_SIZE + SKIP_END;

// --- Stream alignment ---

/** Align HR and glucose streams by time (1-min resolution, <=1 min tolerance). */
export function alignStreams(
  streams: IntervalsStream[],
): { hr: DataPoint[]; glucose: DataPoint[] } | null {
  let timeData: number[] = [];
  let hrRaw: number[] = [];
  let glucoseRaw: number[] = [];

  for (const s of streams) {
    if (s.type === "time") timeData = s.data;
    if (s.type === "heartrate") hrRaw = s.data;
    if (["bloodglucose", "glucose", "ga_smooth"].includes(s.type)) {
      glucoseRaw = s.data;
    }
  }

  if (timeData.length === 0 || hrRaw.length === 0 || glucoseRaw.length === 0) {
    return null;
  }

  const glucoseInMmol = convertGlucoseToMmol(glucoseRaw);

  // Build minute-indexed maps
  const hrByMinute = new Map<number, number>();
  const glucoseByMinute = new Map<number, number>();

  for (let i = 0; i < timeData.length; i++) {
    const minute = Math.round(timeData[i] / 60);
    if (i < hrRaw.length && hrRaw[i] > 0) {
      hrByMinute.set(minute, hrRaw[i]);
    }
    if (i < glucoseInMmol.length && glucoseInMmol[i] > 0) {
      glucoseByMinute.set(minute, glucoseInMmol[i]);
    }
  }

  // Find overlapping minutes (tolerance: exact match at minute resolution)
  const hr: DataPoint[] = [];
  const glucose: DataPoint[] = [];

  for (const [minute, hrVal] of hrByMinute) {
    const gVal = glucoseByMinute.get(minute)
      ?? glucoseByMinute.get(minute - 1)
      ?? glucoseByMinute.get(minute + 1);
    if (gVal != null) {
      hr.push({ time: minute, value: hrVal });
      glucose.push({ time: minute, value: gVal });
    }
  }

  // Sort by time
  hr.sort((a, b) => a.time - b.time);
  glucose.sort((a, b) => a.time - b.time);

  if (hr.length < MIN_ALIGNED_POINTS) return null;

  return { hr, glucose };
}

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

    // BG slope: (end - start) / windowMin * 10 → mmol/L per 10 min
    const bgRate = ((gEnd - gStart) / WINDOW_SIZE) * 10;

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
