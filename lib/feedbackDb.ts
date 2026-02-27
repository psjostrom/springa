import { db } from "./db";

export interface RunFeedbackRecord {
  email: string;
  createdAt: number;
  activityId?: string;
  rating?: string;
  comment?: string;
  distance?: number;
  duration?: number;
  avgHr?: number;
  carbsG?: number;
}

export async function saveRunFeedback(
  email: string,
  feedback: {
    createdAt: number;
    distance?: number;
    duration?: number;
    avgHr?: number;
  },
): Promise<void> {
  await db().execute({
    sql: `INSERT INTO run_feedback (email, created_at, distance, duration, avg_hr)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      email,
      feedback.createdAt,
      feedback.distance ?? null,
      feedback.duration ?? null,
      feedback.avgHr ?? null,
    ],
  });
}

export async function getRunFeedback(
  email: string,
  createdAt: number,
): Promise<RunFeedbackRecord | null> {
  const result = await db().execute({
    sql: "SELECT email, created_at, activity_id, rating, comment, distance, duration, avg_hr, carbs_g FROM run_feedback WHERE email = ? AND created_at = ?",
    args: [email, createdAt],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    email: row.email as string,
    createdAt: row.created_at as number,
    activityId: row.activity_id as string | undefined,
    rating: row.rating as string | undefined,
    comment: row.comment as string | undefined,
    distance: row.distance as number | undefined,
    duration: row.duration as number | undefined,
    avgHr: row.avg_hr as number | undefined,
    carbsG: row.carbs_g as number | undefined,
  };
}

export async function updateRunFeedback(
  email: string,
  createdAt: number,
  rating: string,
  comment?: string,
  carbsG?: number,
  activityId?: string,
): Promise<void> {
  await db().execute({
    sql: "UPDATE run_feedback SET rating = ?, comment = ?, carbs_g = ?, activity_id = COALESCE(?, activity_id) WHERE email = ? AND created_at = ?",
    args: [rating, comment ?? null, carbsG ?? null, activityId ?? null, email, createdAt],
  });
}

/** Fetch feedback for a specific activity. */
export async function getRunFeedbackByActivity(
  email: string,
  activityId: string,
): Promise<RunFeedbackRecord | null> {
  const result = await db().execute({
    sql: "SELECT email, created_at, activity_id, rating, comment, distance, duration, avg_hr, carbs_g FROM run_feedback WHERE email = ? AND activity_id = ?",
    args: [email, activityId],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    email: row.email as string,
    createdAt: row.created_at as number,
    activityId: row.activity_id as string | undefined,
    rating: row.rating as string | undefined,
    comment: row.comment as string | undefined,
    distance: row.distance as number | undefined,
    duration: row.duration as number | undefined,
    avgHr: row.avg_hr as number | undefined,
    carbsG: row.carbs_g as number | undefined,
  };
}

/** Update carbs on a feedback record by activity ID. */
export async function updateFeedbackCarbsByActivity(
  email: string,
  activityId: string,
  carbsG: number,
): Promise<boolean> {
  const result = await db().execute({
    sql: "UPDATE run_feedback SET carbs_g = ? WHERE email = ? AND activity_id = ?",
    args: [carbsG, email, activityId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/** Fetch recent rated feedback for AI consumers. */
export async function getRecentFeedback(
  email: string,
  sinceDays: number = 14,
  limit: number = 20,
): Promise<RunFeedbackRecord[]> {
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const result = await db().execute({
    sql: `SELECT email, created_at, activity_id, rating, comment, distance, duration, avg_hr, carbs_g
          FROM run_feedback
          WHERE email = ? AND rating IS NOT NULL AND rating != 'skipped'
            AND created_at >= ?
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [email, cutoff, limit],
  });
  return result.rows.map((row) => ({
    email: row.email as string,
    createdAt: row.created_at as number,
    activityId: row.activity_id as string | undefined,
    rating: row.rating as string | undefined,
    comment: row.comment as string | undefined,
    distance: row.distance as number | undefined,
    duration: row.duration as number | undefined,
    avgHr: row.avg_hr as number | undefined,
    carbsG: row.carbs_g as number | undefined,
  }));
}
