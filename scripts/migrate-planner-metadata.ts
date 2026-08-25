/** Add Planner generated-config metadata columns to user_settings. */
import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    console.error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN required");
    process.exit(1);
  }

  const database = createClient({ url, authToken: token });
  for (const sql of [
    "ALTER TABLE user_settings ADD COLUMN generated_plan_config TEXT",
    "ALTER TABLE user_settings ADD COLUMN planner_config_dirty INTEGER NOT NULL DEFAULT 0",
  ]) {
    try {
      await database.execute(sql);
      console.log(`OK: ${sql}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("duplicate column")) {
        console.log(`SKIP (already exists): ${sql}`);
      } else {
        throw error;
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
