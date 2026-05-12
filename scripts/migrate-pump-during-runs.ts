/**
 * Schema migration for PR #192:
 *   1. Add `user_settings.pump_during_runs` (NULL = "user has not yet chosen";
 *      AccountTab UI prompts the user to pick on/off/mixed). Intentional
 *      nullable: this is a real product state, not a backfill candidate.
 *   2. Drop the dead `activity_streams.run_bg_context` column. After this PR,
 *      `runBGContext` is computed on every read of `getActivityStreams` from
 *      the Scout batch endpoint — the column was never read or written by
 *      production code on the new path.
 *   3. Drop the dead `bg_patterns` table. The only writer (the `/api/bg-patterns`
 *      POST route, triggered by the removed `BGResponsePanel`) is gone, so the
 *      table will only ever go stale from here on. Readers (chat / adapt-plan /
 *      run-analysis) have been updated to drop the dependency.
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
    {
      sql: "DROP TABLE IF EXISTS bg_patterns",
      // IF EXISTS makes this idempotent on its own — the matcher is unused
      // but kept for symmetry with the loop's contract.
      idempotentError: "no such table",
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
