import type { BGReading } from "./cgm";
import type { CalendarEvent } from "./types";
import type { WorkoutCategory } from "./types";
import { linearRegression } from "./math";
import { BG_HYPO, BG_STABLE_MIN, BG_STABLE_MAX } from "./constants";
import { db } from "./db";
import { getUserCredentials } from "./credentials";
import { fetchBGFromNS } from "./nightscout";

// --- Types ---

export interface PreRunContext {
  entrySlope30m: number; // mmol/L per min, linear regression over 30 min before start
  entryStability: number; // std dev of mmol readings in 60 min before start
  startBG: number; // closest CGM reading to run start
  readingCount: number; // readings that contributed
}

export interface PostRunContext {
  recoveryDrop30m: number; // BG change (mmol/L) in first 30 min after end
  nadirPostRun: number; // lowest mmol/L in 2h after
  timeToStable: number | null; // min until BG stays in 4-10 for 15+ min, null if never
  postRunHypo: boolean; // any reading < 3.9 in 2h after
  endBG: number; // closest CGM reading to run end
  readingCount: number;
  peak30m: number; // max BG in 30m after end
  spike30m: number; // peak30m - endBG (positive = BG rose post-run)
  peak60mAboveEnd?: number; // max(reading.mmol - endBG) within 60 min after run end; 0 if never rises above end. Optional because legacy rows pre-date Task 8.
}

export interface RunBGContext {
  activityId: string;
  category: WorkoutCategory;
  pre: PreRunContext | null; // null if insufficient readings before run
  post: PostRunContext | null; // null if insufficient readings after run
  totalBGImpact: number | null; // startBG vs BG at 2h after
}

// --- Constants ---

export const MAX_GAP_MS = 10 * 60 * 1000; // 10 minutes
export const PRE_SLOPE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
export const PRE_STABILITY_WINDOW_MS = 60 * 60 * 1000; // 60 minutes
export const POST_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
export const POST_30M_MS = 30 * 60 * 1000; // 30 minutes
export const STABLE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const MIN_READINGS = 2;
export const MIN_RATE_SAMPLES = 3;

// --- Utility functions ---

/** Binary search for readings in [startMs, endMs). Returns slice of readings in window. */
export function findReadingsInWindow(
  readings: BGReading[],
  startMs: number,
  endMs: number,
): BGReading[] {
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

/** Linear regression returning mmol/L per minute. Null if < 2 readings. */
export function computeSlope(readings: BGReading[]): number | null {
  if (readings.length < MIN_READINGS) return null;

  const t0 = readings[0].ts;
  const points = readings.map((r) => ({
    x: (r.ts - t0) / 60000, // minutes
    y: r.mmol,
  }));

  const { slope } = linearRegression(points);
  return slope;
}

/** Standard deviation of mmol values. Returns 0 for single value. */
export function computeStdDev(readings: BGReading[]): number {
  if (readings.length <= 1) return 0;

  const values = readings.map((r) => r.mmol);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Nearest reading within maxGapMs of targetMs. Returns null if none close enough. */
export function closestReading(
  readings: BGReading[],
  targetMs: number,
  maxGapMs: number = MAX_GAP_MS,
): BGReading | null {
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
  let best: BGReading | null = null;
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

/** Extract pre-run context from CGM readings. */
export function computePreRunContext(
  readings: BGReading[],
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

/** Extract post-run context from CGM readings. */
export function computePostRunContext(
  readings: BGReading[],
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

  // Peak BG in first 30 min after run end
  const peak30m = recovery30m.length >= 2
    ? Math.max(...recovery30m.map((r) => r.mmol))
    : endReading.mmol;
  const spike30m = Math.max(0, peak30m - endReading.mmol);

  // Peak BG rise above end within 60 min
  const within60 = findReadingsInWindow(
    readings,
    runEndMs,
    runEndMs + 60 * 60 * 1000,
  );
  const peak60mAboveEnd = within60.length > 0
    ? Math.max(0, ...within60.map((r) => r.mmol - endReading.mmol))
    : 0;

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
    peak30m,
    spike30m,
    peak60mAboveEnd,
  };
}

/** Find minutes after runEnd until BG stays in 4-10 mmol/L for 15+ consecutive minutes. */
function computeTimeToStable(
  postReadings: BGReading[],
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
  readings: BGReading[],
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
  readings: BGReading[],
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

// ────────────────────────────────────────────────────────────────────────────
// Server-side ingest-time computation
// ────────────────────────────────────────────────────────────────────────────

interface IngestActivity {
  activityId: string;
  runStartMs?: number;
  hr: { time: number; value: number }[];
  category: WorkoutCategory;
  name?: string;
}

/**
 * Fetch BG readings for a run window. Tries local bg_readings first; falls
 * back to Nightscout (Scout) using the user's credentials. Returns sorted
 * ascending. Returns empty array if no data is available.
 */
async function fetchReadingsForWindow(
  email: string,
  startWindow: number,
  endWindow: number,
): Promise<BGReading[]> {
  // 1. Local bg_readings (Glooko import data; legacy)
  try {
    const local = await db().execute({
      sql: `SELECT ts, mmol FROM bg_readings WHERE email = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC`,
      args: [email, startWindow, endWindow],
    });
    if (local.rows.length > 0) {
      return local.rows.map((r) => ({
        sgv: 0,
        mmol: r.mmol as number,
        ts: r.ts as number,
        direction: "NONE",
        delta: 0,
      }));
    }
  } catch {
    // Table may not exist in some test environments — fall through to NS.
  }

  // 2. Nightscout fallback (Scout)
  const creds = await getUserCredentials(email);
  if (!creds?.nightscoutUrl || !creds.nightscoutSecret) return [];

  try {
    const nsReadings = await fetchBGFromNS(creds.nightscoutUrl, creds.nightscoutSecret, {
      since: startWindow,
      until: endWindow,
      count: 1000,
    });
    // NS returns newest-first; downstream expects ascending.
    return [...nsReadings].sort((a, b) => a.ts - b.ts);
  } catch {
    return [];
  }
}

/**
 * Compute runBGContext for a single activity at ingest time. Returns null when
 * inputs are insufficient (no runStartMs, no hr) or no BG readings are
 * available in the window.
 */
export async function computeRunBGContextForActivity(
  email: string,
  activity: IngestActivity,
): Promise<RunBGContext | null> {
  if (activity.runStartMs == null || activity.hr.length === 0) return null;

  const lastHrTime = activity.hr[activity.hr.length - 1].time; // minutes from start
  const runEndMs = activity.runStartMs + lastHrTime * 60_000;

  const startWindow = activity.runStartMs - PRE_STABILITY_WINDOW_MS;
  const endWindow = runEndMs + POST_WINDOW_MS;

  const readings = await fetchReadingsForWindow(email, startWindow, endWindow);
  if (readings.length === 0) return null;

  const pre = computePreRunContext(readings, activity.runStartMs);
  const post = computePostRunContext(readings, runEndMs);
  if (!pre && !post) return null;

  let totalBGImpact: number | null = null;
  if (pre && post) {
    const bg2hAfter = closestReading(readings, runEndMs + POST_WINDOW_MS);
    if (bg2hAfter) totalBGImpact = bg2hAfter.mmol - pre.startBG;
  }

  return {
    activityId: activity.activityId,
    category: activity.category,
    pre,
    post,
    totalBGImpact,
  };
}
