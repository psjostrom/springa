/**
 * One-time migration: add Google Calendar columns to user_settings.
 *
 * Run: npx tsx scripts/migrate-google-calendar.ts
 *
 * Safe to run multiple times — catches "duplicate column" errors.
 */
import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    console.error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN required");
    process.exit(1);
  }

  const db = createClient({ url, authToken: token });

  const columns = [
    "ALTER TABLE user_settings ADD COLUMN google_refresh_token TEXT",
    "ALTER TABLE user_settings ADD COLUMN google_calendar_id TEXT",
  ];

  for (const sql of columns) {
    try {
      await db.execute(sql);
      console.log(`OK: ${sql}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("duplicate column")) {
        console.log(`SKIP (already exists): ${sql}`);
      } else {
        throw e;
      }
    }
  }

  console.log("Migration complete.");
}

main().catch(console.error);
