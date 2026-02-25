import { db } from "./db";

export interface RunSummary {
  activityId: string;
  category: string;
  fuelRate: number | null;
  startBG: number;
  endBG: number | null;
  avgHR: number | null;
  dropRate: number | null; // mmol/L per 10min
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

export async function getRecentRunSummaries(
  email: string,
  limit: number = 10,
): Promise<RunSummary[]> {
  const result = await db().execute({
    sql: `SELECT b.activity_id, b.category, b.fuel_rate, b.start_bg, b.glucose, b.hr
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
    const avgHR = hr.length > 0
      ? Math.round(hr.reduce((sum, point) => sum + point.value, 0) / hr.length)
      : null;

    let dropRate: number | null = null;
    if (glucose.length >= 2) {
      const durationSec = glucose[glucose.length - 1].time - glucose[0].time;
      const duration10m = durationSec / 600;
      if (duration10m > 0) {
        dropRate = (glucose[glucose.length - 1].value - glucose[0].value) / duration10m;
      }
    }

    return {
      activityId: row.activity_id as string,
      category: row.category as string,
      fuelRate: row.fuel_rate as number | null,
      startBG: row.start_bg as number,
      endBG,
      avgHR,
      dropRate,
    };
  });
}
