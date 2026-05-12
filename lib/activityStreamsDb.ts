import { db } from "./db";
import type { WorkoutCategory } from "./types";
import type { BGContextStatus, RunBGContext } from "./runBGContext";
import { computeRunBGContextsForActivities } from "./runBGContext";
import { getWorkoutCategory } from "./constants";

/**
 * Activity stream data returned to consumers.
 *
 * `runBGContext` is computed on read by `computeRunBGContextsForActivities`,
 * which fetches the union of all activity windows from Scout in one batch
 * round trip and partitions per-activity. Never persisted on `activity_streams`.
 */
export interface CachedActivity {
  activityId: string;
  name?: string;
  category: WorkoutCategory;
  fuelRate: number | null;
  hr: { time: number; value: number }[];
  runBGContext?: RunBGContext | null;
  pace?: { time: number; value: number }[];
  cadence?: { time: number; value: number }[];
  altitude?: { time: number; value: number }[];
  distance?: number[];
  rawTime?: number[];
  activityDate?: string;
  runStartMs?: number;
  glucose?: { time: number; value: number }[];
}

export type EnrichedActivity = CachedActivity;

export interface GetActivityStreamsResult {
  activities: CachedActivity[];
  bgContextStatus: BGContextStatus;
}

/**
 * Variant of `getActivityStreams` that also returns the upstream BG-context
 * status so callers (e.g. the bg-cache route) can surface Scout outages in
 * the UI instead of pretending the user has no history. Most callers don't
 * need this — use `getActivityStreams` and discard the status.
 */
export async function getActivityStreamsWithStatus(
  email: string,
  options?: { since?: Date },
): Promise<GetActivityStreamsResult> {
  const { since } = options ?? {};
  // When `since` is specified, rows with NULL activity_date are excluded (legacy data).
  // Pass no `since` to get all rows including legacy.
  const sql = since
    ? `SELECT activity_id, name, run_start_ms, fuel_rate, hr,
              pace, cadence, altitude, activity_date, distance, raw_time, glucose
       FROM activity_streams WHERE email = ? AND activity_date >= ?
       ORDER BY activity_date DESC`
    : `SELECT activity_id, name, run_start_ms, fuel_rate, hr,
              pace, cadence, altitude, activity_date, distance, raw_time, glucose
       FROM activity_streams WHERE email = ?
       ORDER BY activity_date DESC`;
  const args = since
    ? [email, since.toISOString().slice(0, 10)]
    : [email];
  const result = await db().execute({ sql, args });

  const baseRows = result.rows.map((row) => {
    const name = (row.name as string) || undefined;
    const cat = name ? getWorkoutCategory(name) : "other";
    return {
      activityId: row.activity_id as string,
      name,
      category: (cat === "other" ? "easy" : cat) as CachedActivity["category"],
      fuelRate: (row.fuel_rate as number | null) ?? null,
      hr: JSON.parse(row.hr as string) as CachedActivity["hr"],
      pace: row.pace ? (JSON.parse(row.pace as string) as CachedActivity["pace"]) : [],
      cadence: row.cadence ? (JSON.parse(row.cadence as string) as CachedActivity["cadence"]) : [],
      altitude: row.altitude ? (JSON.parse(row.altitude as string) as CachedActivity["altitude"]) : [],
      activityDate: (row.activity_date as string) || undefined,
      distance: row.distance ? (JSON.parse(row.distance as string) as CachedActivity["distance"]) : undefined,
      rawTime: row.raw_time ? (JSON.parse(row.raw_time as string) as CachedActivity["rawTime"]) : undefined,
      runStartMs: row.run_start_ms as number | undefined,
      glucose: row.glucose ? (JSON.parse(row.glucose as string) as CachedActivity["glucose"]) : undefined,
    };
  });

  // Pure derivation: one Scout batch round trip covers the union of all
  // activity windows, then per-activity windows are partitioned in JS.
  const { contexts, status } = await computeRunBGContextsForActivities(
    email,
    baseRows.map((row) => ({
      activityId: row.activityId,
      runStartMs: row.runStartMs,
      hr: row.hr,
      category: row.category,
      name: row.name,
    })),
  );

  return {
    activities: baseRows.map((row) => ({
      ...row,
      runBGContext: contexts.get(row.activityId) ?? null,
    })),
    bgContextStatus: status,
  };
}

/**
 * Backwards-compatible wrapper that returns just the activities (drops the
 * upstream status). Existing callers (cron, simulate, workout-estimation,
 * tests) don't need to render the Scout outage banner; only the bg-cache
 * route does, and it uses `getActivityStreamsWithStatus` directly.
 */
export async function getActivityStreams(
  email: string,
  options?: { since?: Date },
): Promise<CachedActivity[]> {
  const { activities } = await getActivityStreamsWithStatus(email, options);
  return activities;
}

/**
 * Persist activity streams. `runBGContext` is not stored — it's recomputed on
 * every read by `getActivityStreams`.
 */
export async function saveActivityStreams(
  email: string,
  data: CachedActivity[],
): Promise<void> {
  await db().batch(
    [
      { sql: "DELETE FROM activity_streams WHERE email = ?", args: [email] },
      ...data.map((a) => ({
        sql: `INSERT INTO activity_streams (email, activity_id, name, run_start_ms, fuel_rate, hr, pace, cadence, altitude, activity_date, distance, raw_time, glucose)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          email,
          a.activityId,
          a.name ?? null,
          a.runStartMs ?? null,
          a.fuelRate ?? null,
          JSON.stringify(a.hr),
          a.pace && a.pace.length > 0 ? JSON.stringify(a.pace) : null,
          a.cadence && a.cadence.length > 0 ? JSON.stringify(a.cadence) : null,
          a.altitude && a.altitude.length > 0 ? JSON.stringify(a.altitude) : null,
          a.activityDate ?? null,
          a.distance && a.distance.length > 0 ? JSON.stringify(a.distance) : null,
          a.rawTime && a.rawTime.length > 0 ? JSON.stringify(a.rawTime) : null,
          a.glucose && a.glucose.length > 0 ? JSON.stringify(a.glucose) : null,
        ],
      })),
    ],
    "write",
  );
}
