import { db } from "./db";
import { getWorkoutCategory } from "./constants";
import type { CachedActivity, EnrichedActivity } from "./activityStreamsDb";
import type { CalendarEvent, IntervalsActivity } from "./types";
import { nonEmpty } from "./format";

export interface RunHistoryBG {
  startBG: number;
  endBG: number | null;
  dropRate: number | null; // mmol/L per min
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

export async function getRecentAnalyzedRuns(
  email: string,
  limit = 10,
): Promise<CachedActivity[]> {
  const result = await db().execute({
    sql: `SELECT b.activity_id, b.name, b.run_start_ms, b.fuel_rate, b.hr,
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
      category: (rawCat === "other" ? "easy" : rawCat) as CachedActivity["category"],
      fuelRate: (row.fuel_rate as number | null) ?? null,
      hr: JSON.parse(row.hr as string) as { time: number; value: number }[],
      activityDate: (row.activity_date as string | null) ?? undefined,
      runStartMs: (row.run_start_ms as number | undefined) ?? undefined,
    };
  });
}

export function buildRunHistory(
  rows: EnrichedActivity[],
  activityMap: Map<string, IntervalsActivity>,
): RunHistoryEntry[] {
  return rows.map((row) => {
    const { glucose, hr, activityId, category, activityDate } = row;

    const endBG = glucose?.length ? glucose[glucose.length - 1].value : null;
    const avgHRFromStream = hr.length > 0
      ? Math.round(hr.reduce((sum, point) => sum + point.value, 0) / hr.length)
      : null;

    let dropRate: number | null = null;
    if (glucose && glucose.length >= 2) {
      const durationMin = glucose[glucose.length - 1].time - glucose[0].time;
      const duration5m = durationMin / 5;
      if (duration5m > 0) {
        dropRate = (glucose[glucose.length - 1].value - glucose[0].value) / duration5m;
      }
    }

    const activity = activityMap.get(activityId);

    const distanceKm = activity?.distance ? activity.distance / 1000 : undefined;
    const durationMinCalc = activity?.moving_time ? activity.moving_time / 60 : undefined;
    let pace: number | undefined;
    if (distanceKm && durationMinCalc && distanceKm > 0) {
      pace = durationMinCalc / distanceKm;
    }

    const event: CalendarEvent = {
      id: `activity-${activityId}`,
      activityId,
      date: activityDate ? new Date(activityDate) : new Date(),
      name: activity?.name ?? `${category} run`,
      description: "",
      type: "completed",
      category: category as CalendarEvent["category"],
      distance: activity?.distance,
      duration: activity?.moving_time,
      pace: activity?.pace ? 1000 / (activity.pace * 60) : pace,
      avgHr: (activity?.average_heartrate ?? activity?.average_hr) ?? avgHRFromStream ?? undefined,
      maxHr: activity?.max_heartrate ?? activity?.max_hr,
      load: activity?.icu_training_load,
      fuelRate: row.fuelRate,
      carbsIngested: activity?.carbs_ingested ?? null,
      preRunCarbsG: activity?.PreRunCarbsG === 0 ? null : activity?.PreRunCarbsG ?? null,
      rating: nonEmpty(activity?.Rating),
      feedbackComment: nonEmpty(activity?.FeedbackComment),
    };

    const startBG = glucose?.length ? glucose[0].value : 0;

    return {
      event,
      bgSummary: { startBG, endBG, dropRate },
    };
  });
}
