import { db, runMigration, addColumns } from "./db";
import type { WorkoutCategory } from "./types";
import type { RunBGContext } from "./runBGContext";

export interface CachedActivity {
  activityId: string;
  category: WorkoutCategory;
  fuelRate: number | null;
  startBG: number;
  glucose: { time: number; value: number }[];
  hr: { time: number; value: number }[];
  runBGContext?: RunBGContext | null;
  pace?: { time: number; value: number }[];
  cadence?: { time: number; value: number }[];
  altitude?: { time: number; value: number }[];
  activityDate?: string;
}

async function migrateBGCacheSchema(): Promise<void> {
  await runMigration("bg_cache", () =>
    addColumns("bg_cache", [
      { name: "pace", type: "TEXT" },
      { name: "cadence", type: "TEXT" },
      { name: "altitude", type: "TEXT" },
      { name: "activity_date", type: "TEXT" },
    ]),
  );
}

export async function getBGCache(email: string): Promise<CachedActivity[]> {
  await migrateBGCacheSchema();
  const result = await db().execute({
    sql: "SELECT activity_id, category, fuel_rate, start_bg, glucose, hr, run_bg_context, pace, cadence, altitude, activity_date FROM bg_cache WHERE email = ?",
    args: [email],
  });
  return result.rows.map((row) => ({
    activityId: row.activity_id as string,
    category: row.category as CachedActivity["category"],
    fuelRate: row.fuel_rate as number | null,
    startBG: row.start_bg as number,
    glucose: JSON.parse(row.glucose as string),
    hr: JSON.parse(row.hr as string),
    runBGContext: row.run_bg_context ? JSON.parse(row.run_bg_context as string) : null,
    pace: row.pace ? JSON.parse(row.pace as string) : [],
    cadence: row.cadence ? JSON.parse(row.cadence as string) : [],
    altitude: row.altitude ? JSON.parse(row.altitude as string) : [],
    activityDate: (row.activity_date as string) || undefined,
  }));
}

export async function saveBGCache(
  email: string,
  data: CachedActivity[],
): Promise<void> {
  await migrateBGCacheSchema();
  await db().batch(
    [
      { sql: "DELETE FROM bg_cache WHERE email = ?", args: [email] },
      ...data.map((a) => ({
        sql: `INSERT INTO bg_cache (email, activity_id, category, fuel_rate, start_bg, glucose, hr, run_bg_context, pace, cadence, altitude, activity_date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          email,
          a.activityId,
          a.category,
          a.fuelRate,
          a.startBG,
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
