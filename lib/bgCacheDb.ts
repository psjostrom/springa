import { db } from "./db";
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
  // CalendarEvent metadata (for history in run-analysis prompt)
  name?: string;
  distance?: number;
  duration?: number;
  avgPace?: number;
  avgHr?: number;
  maxHr?: number;
  load?: number;
  carbsIngested?: number | null;
}

export async function getBGCache(email: string): Promise<CachedActivity[]> {
  const result = await db().execute({
    sql: `SELECT activity_id, category, fuel_rate, start_bg, glucose, hr, run_bg_context,
                 pace, cadence, altitude, activity_date,
                 name, distance, duration, avg_pace, avg_hr, max_hr, load, carbs_ingested
          FROM bg_cache WHERE email = ?`,
    args: [email],
  });
  return result.rows.map((row) => ({
    activityId: row.activity_id as string,
    category: row.category as CachedActivity["category"],
    fuelRate: row.fuel_rate as number | null,
    startBG: row.start_bg as number,
    glucose: JSON.parse(row.glucose as string) as CachedActivity["glucose"],
    hr: JSON.parse(row.hr as string) as CachedActivity["hr"],
    runBGContext: row.run_bg_context ? (JSON.parse(row.run_bg_context as string) as RunBGContext) : null,
    pace: row.pace ? (JSON.parse(row.pace as string) as CachedActivity["pace"]) : [],
    cadence: row.cadence ? (JSON.parse(row.cadence as string) as CachedActivity["cadence"]) : [],
    altitude: row.altitude ? (JSON.parse(row.altitude as string) as CachedActivity["altitude"]) : [],
    activityDate: (row.activity_date as string) || undefined,
    name: (row.name as string) || undefined,
    distance: row.distance as number | undefined,
    duration: row.duration as number | undefined,
    avgPace: row.avg_pace as number | undefined,
    avgHr: row.avg_hr as number | undefined,
    maxHr: row.max_hr as number | undefined,
    load: row.load as number | undefined,
    carbsIngested: row.carbs_ingested as number | null | undefined,
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
        sql: `INSERT INTO bg_cache (email, activity_id, category, fuel_rate, start_bg, glucose, hr, run_bg_context, pace, cadence, altitude, activity_date, name, distance, duration, avg_pace, avg_hr, max_hr, load, carbs_ingested)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          a.name ?? null,
          a.distance ?? null,
          a.duration ?? null,
          a.avgPace ?? null,
          a.avgHr ?? null,
          a.maxHr ?? null,
          a.load ?? null,
          a.carbsIngested ?? null,
        ],
      })),
    ],
    "write",
  );
}
