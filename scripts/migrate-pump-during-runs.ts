/**
 * Schema migration for PR #192:
 *   1. Add `user_settings.pump_during_runs` (NULL = "user has not yet chosen";
 *      AccountTab UI prompts the user to pick on/off/mixed). Intentional
 *      nullable: this is a real product state, not a backfill candidate.
 *   2. Drop the dead `activity_streams.run_bg_context` column. After this PR,
 *      `runBGContext` is computed on every read of `getActivityStreams` from
 *      the Scout batch endpoint — the column was never read or written by
 *      production code on the new path.
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

  const statements = [
    {
      sql: "ALTER TABLE user_settings ADD COLUMN pump_during_runs TEXT",
      // SQLite treats "duplicate column" as fatal; swallow it on reruns.
      idempotentError: "duplicate column",
    },
    {
      sql: "ALTER TABLE activity_streams DROP COLUMN run_bg_context",
      // SQLite reports "no such column" when the drop has already run.
      idempotentError: "no such column",
    },
  ];

  let applied = 0;
  let skipped = 0;

  for (const { sql, idempotentError } of statements) {
    try {
      await db.execute(sql);
      console.log(`OK: ${sql}`);
      applied++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes(idempotentError)) {
        console.log(`SKIP (already applied): ${sql}`);
        skipped++;
      } else {
        throw err;
      }
    }
  }

  console.log(
    `Migration complete. Applied ${applied}, skipped ${skipped}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
