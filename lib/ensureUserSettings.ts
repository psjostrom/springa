import { db } from "./db";

/** Ensure a user_settings row exists for this email (idempotent). */
export async function ensureUserSettings(email: string): Promise<void> {
  await db().execute({
    sql: "INSERT OR IGNORE INTO user_settings (email) VALUES (?)",
    args: [email],
  });
}
