import { db } from "./db";
import { parseCalendarEventId } from "./calendarEventId";
import { getUserCredentials } from "./credentials";
import { fetchEvent, IntervalsApiError } from "./intervalsApi";

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

/** Remove local rows only when upstream confirms their event no longer exists. */
export async function cleanupOrphanedPreRunCarbs(): Promise<void> {
  const result = await db().execute(
    "SELECT email, event_id FROM prerun_carbs",
  );

  for (const row of result.rows) {
    const email = typeof row.email === "string" ? row.email : null;
    const eventId = parseCalendarEventId(row.event_id);
    if (email == null || eventId == null) {
      console.error("[prerun-carbs] Skipping invalid cleanup row");
      continue;
    }

    try {
      const creds = await getUserCredentials(email);
      if (!creds?.intervalsApiKey) continue;
      await fetchEvent(creds.intervalsApiKey, eventId);
    } catch (error) {
      if (error instanceof IntervalsApiError && error.status === 404) {
        try {
          await deletePreRunCarbs(email, eventId);
        } catch (cleanupError) {
          console.error("[prerun-carbs] Failed to remove orphan:", cleanupError);
        }
      } else {
        console.error("[prerun-carbs] Failed to verify event:", error);
      }
    }
  }
}
