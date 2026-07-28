/**
 * One-time migration: add effort_metric column to user_settings.
 *
 * Run: npx tsx --env-file=.env.local scripts/migrate-effort-metric.ts
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

  const sql = "ALTER TABLE user_settings ADD COLUMN effort_metric TEXT";
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

  console.log("Migration complete. effort_metric defaults to pace when unset.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
