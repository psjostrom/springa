import { db } from "./db";
import type { WorkoutCategory } from "./types";
import type { RunBGContext } from "./runBGContext";

export interface CachedActivity {
  activityId: string;
  category: WorkoutCategory;
  fuelRate: number | null;
  glucose: { time: number; value: number }[];
  hr: { time: number; value: number }[];
  runBGContext?: RunBGContext | null;
  pace?: { time: number; value: number }[];
  cadence?: { time: number; value: number }[];
  altitude?: { time: number; value: number }[];
  activityDate?: string;
}

export async function getBGCache(
  email: string,
  options?: { since?: Date },
): Promise<CachedActivity[]> {
  const { since } = options ?? {};
  // When `since` is specified, rows with NULL activity_date are excluded (legacy data).
  // Pass no `since` to get all rows including legacy.
  const sql = since
    ? `SELECT activity_id, category, fuel_rate, glucose, hr, run_bg_context,
              pace, cadence, altitude, activity_date
       FROM bg_cache WHERE email = ? AND activity_date >= ?
       ORDER BY activity_date DESC`
    : `SELECT activity_id, category, fuel_rate, glucose, hr, run_bg_context,
              pace, cadence, altitude, activity_date
       FROM bg_cache WHERE email = ?
       ORDER BY activity_date DESC`;
  const args = since
    ? [email, since.toISOString().slice(0, 10)]
    : [email];
  const result = await db().execute({ sql, args });
  return result.rows.map((row) => ({
    activityId: row.activity_id as string,
    category: row.category as CachedActivity["category"],
    fuelRate: row.fuel_rate as number | null,
    glucose: JSON.parse(row.glucose as string) as CachedActivity["glucose"],
    hr: JSON.parse(row.hr as string) as CachedActivity["hr"],
    runBGContext: row.run_bg_context ? (JSON.parse(row.run_bg_context as string) as RunBGContext) : null,
    pace: row.pace ? (JSON.parse(row.pace as string) as CachedActivity["pace"]) : [],
    cadence: row.cadence ? (JSON.parse(row.cadence as string) as CachedActivity["cadence"]) : [],
    altitude: row.altitude ? (JSON.parse(row.altitude as string) as CachedActivity["altitude"]) : [],
    activityDate: (row.activity_date as string) || undefined,
  }));
}

export async function saveBGCache(
  email: string,
  data: CachedActivity[],
): Promise<void> {
  await db().batch(
    [
      { sql: "DELETE FROM bg_cache WHERE email = ?", args: [email] },
      ...data.map((a) => ({
        sql: `INSERT INTO bg_cache (email, activity_id, category, fuel_rate, glucose, hr, run_bg_context, pace, cadence, altitude, activity_date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          email,
          a.activityId,
          a.category,
          a.fuelRate,
          JSON.stringify(a.glucose),
          JSON.stringify(a.hr),
          a.runBGContext ? JSON.stringify(a.runBGContext) : null,
          a.pace && a.pace.length > 0 ? JSON.stringify(a.pace) : null,
          a.cadence && a.cadence.length > 0 ? JSON.stringify(a.cadence) : null,
          a.altitude && a.altitude.length > 0 ? JSON.stringify(a.altitude) : null,
          a.activityDate ?? null,
        ],
      })),
    ],
    "write",
  );
}
