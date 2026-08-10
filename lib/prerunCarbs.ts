import { db } from "./db";

export async function getPreRunCarbs(
  email: string,
  eventId: number,
): Promise<number | null> {
  const result = await db().execute({
    sql: "SELECT carbs_g FROM prerun_carbs WHERE email = ? AND event_id = ?",
    args: [email, String(eventId)],
  });
  return result.rows.length > 0
    ? (result.rows[0].carbs_g as number | null)
    : null;
}

export async function savePreRunCarbs(
  email: string,
  eventId: number,
  carbsG: number | null,
): Promise<void> {
  await db().execute({
    sql: `INSERT INTO prerun_carbs (email, event_id, carbs_g, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (email, event_id) DO UPDATE SET
            carbs_g = excluded.carbs_g,
            created_at = excluded.created_at`,
    args: [email, String(eventId), carbsG, Date.now()],
  });
}

export async function deletePreRunCarbs(
  email: string,
  eventId: number,
): Promise<void> {
  await db().execute({
    sql: "DELETE FROM prerun_carbs WHERE email = ? AND event_id = ?",
    args: [email, String(eventId)],
  });
}
