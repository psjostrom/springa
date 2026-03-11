import { db } from "./db";
import type { WorkoutCategory, DataPoint } from "./types";
import type { RunBGContext } from "./runBGContext";
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
}

/** CachedActivity after glucose enrichment from xDrip readings. */
export type EnrichedActivity = CachedActivity & { glucose?: DataPoint[] };

export async function getActivityStreams(
  email: string,
  options?: { since?: Date },
): Promise<CachedActivity[]> {
  const { since } = options ?? {};
  // When `since` is specified, rows with NULL activity_date are excluded (legacy data).
  // Pass no `since` to get all rows including legacy.
  const sql = since
    ? `SELECT activity_id, name, run_start_ms, fuel_rate, hr, run_bg_context,
              pace, cadence, altitude, activity_date, distance, raw_time
       FROM activity_streams WHERE email = ? AND activity_date >= ?
       ORDER BY activity_date DESC`
    : `SELECT activity_id, name, run_start_ms, fuel_rate, hr, run_bg_context,
              pace, cadence, altitude, activity_date, distance, raw_time
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
    };
  });
}

export async function saveActivityStreams(
  email: string,
  data: CachedActivity[],
): Promise<void> {
  await db().batch(
    [
      { sql: "DELETE FROM activity_streams WHERE email = ?", args: [email] },
      ...data.map((a) => ({
        sql: `INSERT INTO activity_streams (email, activity_id, name, run_start_ms, fuel_rate, hr, run_bg_context, pace, cadence, altitude, activity_date, distance, raw_time)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          email,
          a.activityId,
          a.name ?? null,
          a.runStartMs ?? null,
          a.fuelRate ?? null,
          JSON.stringify(a.hr),
          a.runBGContext ? JSON.stringify(a.runBGContext) : null,
          a.pace && a.pace.length > 0 ? JSON.stringify(a.pace) : null,
          a.cadence && a.cadence.length > 0 ? JSON.stringify(a.cadence) : null,
          a.altitude && a.altitude.length > 0 ? JSON.stringify(a.altitude) : null,
          a.activityDate ?? null,
          a.distance && a.distance.length > 0 ? JSON.stringify(a.distance) : null,
          a.rawTime && a.rawTime.length > 0 ? JSON.stringify(a.rawTime) : null,
        ],
      })),
    ],
    "write",
  );
}
