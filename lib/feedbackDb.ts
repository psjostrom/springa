import { db } from "./db";

export interface RunFeedbackRecord {
  email: string;
  createdAt: number;
  activityId?: string;
  rating?: string;
  comment?: string;
  carbsG?: number;
}

/** Create a feedback record when the user submits their rating. */
export async function saveRunFeedback(
  email: string,
  createdAt: number,
  rating: string,
  comment?: string,
  carbsG?: number,
  activityId?: string,
): Promise<void> {
  await db().execute({
    sql: `INSERT OR REPLACE INTO run_feedback (email, created_at, rating, comment, carbs_g, activity_id)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [email, createdAt, rating, comment ?? null, carbsG ?? null, activityId ?? null],
  });
}

export async function getRunFeedback(
  email: string,
  createdAt: number,
): Promise<RunFeedbackRecord | null> {
  const result = await db().execute({
    sql: "SELECT email, created_at, activity_id, rating, comment, carbs_g FROM run_feedback WHERE email = ? AND created_at = ?",
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
    carbsG: row.carbs_g as number | undefined,
  };
}

/** Fetch feedback for a specific activity. */
export async function getRunFeedbackByActivity(
  email: string,
  activityId: string,
): Promise<RunFeedbackRecord | null> {
  const result = await db().execute({
    sql: "SELECT email, created_at, activity_id, rating, comment, carbs_g FROM run_feedback WHERE email = ? AND activity_id = ?",
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
  return result.rowsAffected > 0;
}

/** Check which activity IDs have been rated (non-skipped). */
export async function getRatedActivityIds(
  email: string,
  activityIds: string[],
): Promise<Set<string>> {
  if (activityIds.length === 0) return new Set();
  const placeholders = activityIds.map(() => "?").join(",");
  const result = await db().execute({
    sql: `SELECT activity_id FROM run_feedback
          WHERE email = ? AND activity_id IN (${placeholders})
            AND rating IS NOT NULL AND rating != 'skipped'`,
    args: [email, ...activityIds],
  });
  return new Set(result.rows.map((r) => r.activity_id as string));
}

/** Fetch recent rated feedback for AI consumers. */
export async function getRecentFeedback(
  email: string,
  sinceDays = 14,
  limit = 20,
): Promise<RunFeedbackRecord[]> {
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const result = await db().execute({
    sql: `SELECT email, created_at, activity_id, rating, comment, carbs_g
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
    carbsG: row.carbs_g as number | undefined,
  }));
}
