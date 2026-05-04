/**
 * One-time migration: create workout_event_prescriptions table.
 *
 * Run: npx tsx --env-file=.env.local scripts/migrate-workout-event-prescriptions.ts
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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS workout_event_prescriptions (
      email                TEXT NOT NULL,
      event_id             TEXT NOT NULL,
      planned_duration_sec INTEGER,
      prescribed_carbs_g   INTEGER,
      created_at           INTEGER NOT NULL,
      PRIMARY KEY (email, event_id)
    )
  `);

  console.log("OK: workout_event_prescriptions table is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
