/**
 * One-time migration: add hr_zones and max_hr columns to user_settings.
 *
 * Run: npx tsx --env-file=.env.local scripts/migrate-hr-zones-cache.ts
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

  // SQLite ignores duplicate ALTER TABLE if column already exists — wrap to handle gracefully
  const alterStatements = [
    "ALTER TABLE user_settings ADD COLUMN hr_zones TEXT",
    "ALTER TABLE user_settings ADD COLUMN max_hr INTEGER",
  ];

  for (const sql of alterStatements) {
    try {
      await db.execute(sql);
      console.log(`OK: ${sql}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("duplicate column")) {
        console.log(`SKIP (already exists): ${sql}`);
      } else {
        throw err;
      }
    }
  }

  console.log("Migration complete. hr_zones and max_hr will be populated on next calendar load.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
