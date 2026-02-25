import { db, runMigration, addColumns } from "./db";

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

async function migrateFeedbackSchema(): Promise<void> {
  await runMigration("feedback", () =>
    addColumns("run_feedback", [{ name: "carbs_g", type: "REAL" }]),
  );
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
  await migrateFeedbackSchema();
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
): Promise<void> {
  await migrateFeedbackSchema();
  await db().execute({
    sql: "UPDATE run_feedback SET rating = ?, comment = ?, carbs_g = ? WHERE email = ? AND created_at = ?",
    args: [rating, comment ?? null, carbsG ?? null, email, createdAt],
  });
}

/** Fetch recent rated feedback for the adapt prompt. */
export async function getRecentFeedback(
  email: string,
  limit: number = 10,
): Promise<RunFeedbackRecord[]> {
  await migrateFeedbackSchema();
  const result = await db().execute({
    sql: `SELECT email, created_at, activity_id, rating, comment, distance, duration, avg_hr, carbs_g
          FROM run_feedback
          WHERE email = ? AND rating IS NOT NULL AND rating != 'skipped'
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [email, limit],
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
