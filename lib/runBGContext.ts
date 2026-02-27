import type { XdripReading } from "./xdrip";
import type { CalendarEvent } from "./types";
import type { WorkoutCategory } from "./types";
import { linearRegression } from "./math";
import { BG_HYPO, BG_STABLE_MIN, BG_STABLE_MAX } from "./constants";

// --- Types ---

export interface PreRunContext {
  entrySlope30m: number; // mmol/L per 10min, linear regression over 30 min before start
  entryStability: number; // std dev of mmol readings in 60 min before start
  startBG: number; // closest xDrip reading to run start
  readingCount: number; // readings that contributed
}

export interface PostRunContext {
  recoveryDrop30m: number; // BG change (mmol/L) in first 30 min after end
  nadirPostRun: number; // lowest mmol/L in 2h after
  timeToStable: number | null; // min until BG stays in 4-10 for 15+ min, null if never
  postRunHypo: boolean; // any reading < 3.9 in 2h after
  endBG: number; // closest xDrip reading to run end
  readingCount: number;
}

export interface RunBGContext {
  activityId: string;
  category: WorkoutCategory;
  pre: PreRunContext | null; // null if insufficient readings before run
  post: PostRunContext | null; // null if insufficient readings after run
  totalBGImpact: number | null; // startBG vs BG at 2h after
}

// --- Constants ---

const MAX_GAP_MS = 10 * 60 * 1000; // 10 minutes
const PRE_SLOPE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const PRE_STABILITY_WINDOW_MS = 60 * 60 * 1000; // 60 minutes
const POST_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const POST_30M_MS = 30 * 60 * 1000; // 30 minutes
const STABLE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MIN_READINGS = 2;

// --- Utility functions ---

/** Binary search for readings in [startMs, endMs). Returns slice of readings in window. */
export function findReadingsInWindow(
  readings: XdripReading[],
  startMs: number,
  endMs: number,
): XdripReading[] {
  if (readings.length === 0) return [];

  // Binary search for first reading >= startMs
  let lo = 0;
  let hi = readings.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (readings[mid].ts < startMs) lo = mid + 1;
    else hi = mid;
  }
  const startIdx = lo;

  // Binary search for first reading >= endMs
  lo = startIdx;
  hi = readings.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (readings[mid].ts < endMs) lo = mid + 1;
    else hi = mid;
  }
  const endIdx = lo;

  return readings.slice(startIdx, endIdx);
}

/** Linear regression returning mmol/L per 10min. Null if < 2 readings. */
export function computeSlope(readings: XdripReading[]): number | null {
  if (readings.length < MIN_READINGS) return null;

  const t0 = readings[0].ts;
  const points = readings.map((r) => ({
    x: (r.ts - t0) / 60000, // minutes
    y: r.mmol,
  }));

  const { slope } = linearRegression(points);
  // slope is mmol/L per minute → multiply by 10 for per-10-min
  return slope * 10;
}

/** Standard deviation of mmol values. Returns 0 for single value. */
export function computeStdDev(readings: XdripReading[]): number {
  if (readings.length <= 1) return 0;

  const values = readings.map((r) => r.mmol);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Nearest reading within maxGapMs of targetMs. Returns null if none close enough. */
export function closestReading(
  readings: XdripReading[],
  targetMs: number,
  maxGapMs: number = MAX_GAP_MS,
): XdripReading | null {
  if (readings.length === 0) return null;

  // Binary search for insertion point
  let lo = 0;
  let hi = readings.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (readings[mid].ts < targetMs) lo = mid + 1;
    else hi = mid;
  }

  // Check candidates at lo and lo-1
  let best: XdripReading | null = null;
  let bestDist = Infinity;

  for (const idx of [lo - 1, lo]) {
    if (idx >= 0 && idx < readings.length) {
      const dist = Math.abs(readings[idx].ts - targetMs);
      if (dist < bestDist) {
        bestDist = dist;
        best = readings[idx];
      }
    }
  }

  if (best && bestDist <= maxGapMs) return best;
  return null;
}

/** Extract pre-run context from xDrip readings. */
export function computePreRunContext(
  readings: XdripReading[],
  runStartMs: number,
): PreRunContext | null {
  // Slope: 30 min window before start
  const slopeReadings = findReadingsInWindow(
    readings,
    runStartMs - PRE_SLOPE_WINDOW_MS,
    runStartMs,
  );

  const slope = computeSlope(slopeReadings);
  if (slope === null) return null;

  // StartBG: closest reading to run start
  const startReading = closestReading(readings, runStartMs);
  if (!startReading) return null;

  // Stability: 60 min window before start
  const stabilityReadings = findReadingsInWindow(
    readings,
    runStartMs - PRE_STABILITY_WINDOW_MS,
    runStartMs,
  );
  const stability = computeStdDev(stabilityReadings);

  return {
    entrySlope30m: slope,
    entryStability: stability,
    startBG: startReading.mmol,
    readingCount: slopeReadings.length,
  };
}

/** Extract post-run context from xDrip readings. */
export function computePostRunContext(
  readings: XdripReading[],
  runEndMs: number,
): PostRunContext | null {
  const postReadings = findReadingsInWindow(
    readings,
    runEndMs,
    runEndMs + POST_WINDOW_MS,
  );

  if (postReadings.length < MIN_READINGS) return null;

  // endBG: closest reading to run end
  const endReading = closestReading(readings, runEndMs);
  if (!endReading) return null;

  // Recovery drop in first 30 min
  const recovery30m = findReadingsInWindow(
    readings,
    runEndMs,
    runEndMs + POST_30M_MS,
  );
  let recoveryDrop30m = 0;
  if (recovery30m.length >= 2) {
    recoveryDrop30m =
      recovery30m[recovery30m.length - 1].mmol - recovery30m[0].mmol;
  }

  // Nadir: lowest in 2h after
  const nadirPostRun = Math.min(...postReadings.map((r) => r.mmol));

  // Post-run hypo
  const postRunHypo = postReadings.some((r) => r.mmol < BG_HYPO);

  // Time to stable: minutes until BG stays in 4-10 for 15+ min
  const timeToStable = computeTimeToStable(postReadings, runEndMs);

  return {
    recoveryDrop30m,
    nadirPostRun,
    timeToStable,
    postRunHypo,
    endBG: endReading.mmol,
    readingCount: postReadings.length,
  };
}

/** Find minutes after runEnd until BG stays in 4-10 mmol/L for 15+ consecutive minutes. */
function computeTimeToStable(
  postReadings: XdripReading[],
  runEndMs: number,
): number | null {
  if (postReadings.length === 0) return null;

  // Walk through readings, track when BG enters stable range
  let stableStart: number | null = null;

  for (const r of postReadings) {
    const inRange = r.mmol >= BG_STABLE_MIN && r.mmol <= BG_STABLE_MAX;

    if (inRange) {
      stableStart ??= r.ts;
      if (r.ts - stableStart >= STABLE_DURATION_MS) {
        return Math.round((stableStart - runEndMs) / 60000);
      }
    } else {
      stableStart = null;
    }
  }

  return null;
}

/** Build full RunBGContext for one completed activity. */
export function buildRunBGContext(
  event: CalendarEvent,
  readings: XdripReading[],
): RunBGContext | null {
  if (event.type !== "completed") return null;
  if (!event.duration) return null;
  if (!event.activityId) return null;

  const category = event.category;
  if (category === "race" || category === "other") return null;

  const runStartMs = event.date.getTime();
  const runEndMs = runStartMs + event.duration * 1000;

  const pre = computePreRunContext(readings, runStartMs);
  const post = computePostRunContext(readings, runEndMs);

  // Total BG impact: startBG vs BG at 2h after
  let totalBGImpact: number | null = null;
  if (pre && post) {
    const bg2hAfter = closestReading(readings, runEndMs + POST_WINDOW_MS);
    if (bg2hAfter) {
      totalBGImpact = bg2hAfter.mmol - pre.startBG;
    }
  }

  return {
    activityId: event.activityId,
    category: category as WorkoutCategory,
    pre,
    post,
    totalBGImpact,
  };
}

/** Build RunBGContext map for all completed activities. */
export function buildRunBGContexts(
  events: CalendarEvent[],
  readings: XdripReading[],
): Map<string, RunBGContext> {
  const map = new Map<string, RunBGContext>();
  if (readings.length === 0) return map;

  // Ensure readings are sorted by timestamp
  const sorted = [...readings].sort((a, b) => a.ts - b.ts);

  for (const event of events) {
    if (event.type !== "completed" || !event.activityId) continue;
    const ctx = buildRunBGContext(event, sorted);
    if (ctx) {
      map.set(event.activityId, ctx);
    }
  }

  return map;
}
