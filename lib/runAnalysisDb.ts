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

export async function getRecentRunHistory(
  email: string,
  limit: number = 10,
): Promise<RunHistoryEntry[]> {
  const result = await db().execute({
    sql: `SELECT b.activity_id, b.category, b.fuel_rate, b.start_bg, b.glucose, b.hr,
                 b.activity_date, b.name, b.distance, b.duration, b.avg_pace,
                 b.avg_hr, b.max_hr, b.load, b.carbs_ingested
          FROM bg_cache b
          INNER JOIN run_analysis r ON b.email = r.email AND b.activity_id = r.activity_id
          WHERE b.email = ?
          ORDER BY b.ROWID DESC
          LIMIT ?`,
    args: [email, limit],
  });

  return result.rows.map((row) => {
    const glucose: { time: number; value: number }[] = JSON.parse(row.glucose as string);
    const hr: { time: number; value: number }[] = JSON.parse(row.hr as string);

    const endBG = glucose.length > 0 ? glucose[glucose.length - 1].value : null;
    const avgHRFromStream = hr.length > 0
      ? Math.round(hr.reduce((sum, point) => sum + point.value, 0) / hr.length)
      : null;

    let dropRate: number | null = null;
    if (glucose.length >= 2) {
      const durationMin = glucose[glucose.length - 1].time - glucose[0].time;
      const duration10m = durationMin / 10;
      if (duration10m > 0) {
        dropRate = (glucose[glucose.length - 1].value - glucose[0].value) / duration10m;
      }
    }

    const dateStr = row.activity_date as string | null;

    const event: CalendarEvent = {
      id: `activity-${row.activity_id as string}`,
      activityId: row.activity_id as string,
      date: dateStr ? new Date(dateStr) : new Date(),
      name: (row.name as string) || `${row.category} run`,
      description: "",
      type: "completed",
      category: (row.category as string) as CalendarEvent["category"],
      distance: row.distance as number | undefined,
      duration: row.duration as number | undefined,
      pace: row.avg_pace as number | undefined,
      avgHr: (row.avg_hr as number | undefined) ?? avgHRFromStream ?? undefined,
      maxHr: row.max_hr as number | undefined,
      load: row.load as number | undefined,
      fuelRate: row.fuel_rate as number | null,
      carbsIngested: row.carbs_ingested as number | null,
    };

    return {
      event,
      bgSummary: { startBG: row.start_bg as number, endBG, dropRate },
    };
  });
}
