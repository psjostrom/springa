import { db } from "./db";
import type { WorkoutCategory } from "./types";
import type { RunBGContext } from "./runBGContext";
import { computeRunBGContextForActivity } from "./runBGContext";
import { getWorkoutCategory } from "./constants";

/** What's stored in the activity_streams DB table — no glucose. */
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

/** Alias — glucose is now part of CachedActivity, so this is structurally identical. */
export type EnrichedActivity = CachedActivity;

export async function getActivityStreams(
  email: string,
  options?: { since?: Date },
): Promise<CachedActivity[]> {
  const { since } = options ?? {};
  // When `since` is specified, rows with NULL activity_date are excluded (legacy data).
  // Pass no `since` to get all rows including legacy.
  const sql = since
    ? `SELECT activity_id, name, run_start_ms, fuel_rate, hr, run_bg_context,
              pace, cadence, altitude, activity_date, distance, raw_time, glucose
       FROM activity_streams WHERE email = ? AND activity_date >= ?
       ORDER BY activity_date DESC`
    : `SELECT activity_id, name, run_start_ms, fuel_rate, hr, run_bg_context,
              pace, cadence, altitude, activity_date, distance, raw_time, glucose
       FROM activity_streams WHERE email = ?
       ORDER BY activity_date DESC`;
  const args = since
    ? [email, since.toISOString().slice(0, 10)]
    : [email];
  const result = await db().execute({ sql, args });
  return result.rows.map((row) => {
    const name = (row.name as string) || undefined;
    const cat = name ? getWorkoutCategory(name) : "other";
    return {
      activityId: row.activity_id as string,
      name,
      category: (cat === "other" ? "easy" : cat) as CachedActivity["category"],
      fuelRate: (row.fuel_rate as number | null) ?? null,
      hr: JSON.parse(row.hr as string) as CachedActivity["hr"],
      runBGContext: row.run_bg_context ? (JSON.parse(row.run_bg_context as string) as RunBGContext) : null,
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
}

/**
 * Persist activity streams. The client never owns `runBGContext` — it's
 * computed server-side from BG readings (local bg_readings, falling back to
 * Scout). Existing rows whose hr+glucose payload hasn't changed keep their
 * stored context to avoid recomputing on every save.
 */
export async function saveActivityStreams(
  email: string,
  data: CachedActivity[],
): Promise<void> {
  // 1. Pre-load existing rows for the activities we're about to save so we can
  //    skip recomputation when the incoming hr/glucose payload matches.
  const existing = new Map<
    string,
    { runBGContext: string | null; hrLen: number; glucoseLen: number }
  >();
  if (data.length > 0) {
    const placeholders = data.map(() => "?").join(",");
    const result = await db().execute({
      sql: `SELECT activity_id, run_bg_context, hr, glucose FROM activity_streams
            WHERE email = ? AND activity_id IN (${placeholders})`,
      args: [email, ...data.map((a) => a.activityId)],
    });
    for (const row of result.rows) {
      const hr = row.hr ? (JSON.parse(row.hr as string) as unknown[]) : [];
      const glucose = row.glucose ? (JSON.parse(row.glucose as string) as unknown[]) : [];
      existing.set(row.activity_id as string, {
        runBGContext: (row.run_bg_context as string | null) ?? null,
        hrLen: hr.length,
        glucoseLen: glucose.length,
      });
    }
  }

  // 2. For each incoming activity, decide whether to reuse the existing
  //    context (cheap) or recompute via fresh BG-reading lookup (slower).
  const contexts = await Promise.all(
    data.map(async (a) => {
      const prev = existing.get(a.activityId);
      const incomingHrLen = a.hr.length;
      const incomingGlucoseLen = a.glucose?.length ?? 0;
      if (
        prev?.runBGContext &&
        prev.hrLen === incomingHrLen &&
        prev.glucoseLen === incomingGlucoseLen
      ) {
        return prev.runBGContext; // reuse stored JSON string
      }
      const ctx = await computeRunBGContextForActivity(email, {
        activityId: a.activityId,
        runStartMs: a.runStartMs,
        hr: a.hr,
        category: a.category,
        name: a.name,
      });
      // Preserve prior context when recompute yields nothing — overwriting with
      // null wipes data that's still valid (e.g. when bg_readings is sparse for
      // the new window or NS is briefly unreachable).
      return ctx ? JSON.stringify(ctx) : (prev?.runBGContext ?? null);
    }),
  );

  // 3. Single batched DELETE + INSERT.
  await db().batch(
    [
      { sql: "DELETE FROM activity_streams WHERE email = ?", args: [email] },
      ...data.map((a, i) => ({
        sql: `INSERT INTO activity_streams (email, activity_id, name, run_start_ms, fuel_rate, hr, run_bg_context, pace, cadence, altitude, activity_date, distance, raw_time, glucose)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          email,
          a.activityId,
          a.name ?? null,
          a.runStartMs ?? null,
          a.fuelRate ?? null,
          JSON.stringify(a.hr),
          contexts[i],
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
