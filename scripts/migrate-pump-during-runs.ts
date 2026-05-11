/**
 * One-time migration: add pump_during_runs column to user_settings.
 *
 * Run: npx tsx --env-file=.env.local scripts/migrate-pump-during-runs.ts
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

  const alterStatements = [
    "ALTER TABLE user_settings ADD COLUMN pump_during_runs TEXT",
  ];

  let added = 0;
  let skipped = 0;

  for (const sql of alterStatements) {
    try {
      await db.execute(sql);
      console.log(`OK: ${sql}`);
      added++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("duplicate column")) {
        console.log(`SKIP (already exists): ${sql}`);
        skipped++;
      } else {
        throw err;
      }
    }
  }

  console.log(
    `Migration complete. Added ${added} column(s), skipped ${skipped}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
