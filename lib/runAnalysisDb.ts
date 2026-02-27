import { db } from "./db";
import type { CalendarEvent } from "./types";

export interface RunHistoryBG {
  startBG: number;
  endBG: number | null;
  dropRate: number | null; // mmol/L per 10min
}

export interface RunHistoryEntry {
  event: CalendarEvent;
  bgSummary: RunHistoryBG;
}

export async function getRunAnalysis(
  email: string,
  activityId: string,
): Promise<string | null> {
  const result = await db().execute({
    sql: "SELECT text FROM run_analysis WHERE email = ? AND activity_id = ?",
    args: [email, activityId],
  });
  return result.rows.length > 0 ? (result.rows[0].text as string) : null;
}

export async function saveRunAnalysis(
  email: string,
  activityId: string,
  text: string,
): Promise<void> {
  await db().execute({
    sql: "INSERT OR REPLACE INTO run_analysis (email, activity_id, text) VALUES (?, ?, ?)",
    args: [email, activityId, text],
  });
}

export interface CachedRunRow {
  activityId: string;
  category: string;
  fuelRate: number | null;
  startBG: number;
  glucose: { time: number; value: number }[];
  hr: { time: number; value: number }[];
  activityDate: string | null;
}

export async function getRecentAnalyzedRuns(
  email: string,
  limit = 10,
): Promise<CachedRunRow[]> {
  const result = await db().execute({
    sql: `SELECT b.activity_id, b.category, b.fuel_rate, b.start_bg, b.glucose, b.hr,
                 b.activity_date
          FROM bg_cache b
          INNER JOIN run_analysis r ON b.email = r.email AND b.activity_id = r.activity_id
          WHERE b.email = ?
          ORDER BY b.ROWID DESC
          LIMIT ?`,
    args: [email, limit],
  });

  return result.rows.map((row) => ({
    activityId: row.activity_id as string,
    category: row.category as string,
    fuelRate: row.fuel_rate as number | null,
    startBG: row.start_bg as number,
    glucose: JSON.parse(row.glucose as string) as { time: number; value: number }[],
    hr: JSON.parse(row.hr as string) as { time: number; value: number }[],
    activityDate: (row.activity_date as string | null) ?? null,
  }));
}
