import { db } from "./db";
import { getWorkoutCategory } from "./constants";
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
  name?: string;
  category: string;
  fuelRate: number | null;
  glucose: { time: number; value: number }[];
  hr: { time: number; value: number }[];
  activityDate: string | null;
  runStartMs?: number;
}

export async function getRecentAnalyzedRuns(
  email: string,
  limit = 10,
): Promise<CachedRunRow[]> {
  const result = await db().execute({
    sql: `SELECT b.activity_id, b.name, b.run_start_ms, b.hr,
                 b.activity_date
          FROM activity_streams b
          INNER JOIN run_analysis r ON b.email = r.email AND b.activity_id = r.activity_id
          WHERE b.email = ?
          ORDER BY b.ROWID DESC
          LIMIT ?`,
    args: [email, limit],
  });

  return result.rows.map((row) => {
    const name = (row.name as string) || undefined;
    const rawCat = name ? getWorkoutCategory(name) : "other";
    return {
      activityId: row.activity_id as string,
      name,
      category: rawCat === "other" ? "easy" : rawCat,
      fuelRate: null,
      glucose: [],
      hr: JSON.parse(row.hr as string) as { time: number; value: number }[],
      activityDate: (row.activity_date as string | null) ?? null,
      runStartMs: (row.run_start_ms as number) ?? undefined,
    };
  });
}
