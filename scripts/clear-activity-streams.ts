/**
 * Clear activity_streams table to force rebuild with CGM data.
 *
 * Usage: npx tsx scripts/clear-activity-streams.ts [email]
 *
 * If email is provided, only clears streams for that user.
 * If no email, clears all stream entries.
 */

import { db } from "../lib/db";

async function main() {
  const email = process.argv[2];

  if (email) {
    console.log(`Clearing activity_streams for ${email}...`);
    const result = await db().execute({
      sql: "DELETE FROM activity_streams WHERE email = ?",
      args: [email],
    });
    console.log(`Deleted ${result.rowsAffected} entries`);
  } else {
    console.log("Clearing all activity_streams entries...");
    const result = await db().execute({
      sql: "DELETE FROM activity_streams",
      args: [],
    });
    console.log(`Deleted ${result.rowsAffected} entries`);
  }

  console.log("\nDone! Streams will rebuild on next page load.");
  console.log("Note: Users should also clear localStorage keys 'bgcache' and 'bgcache_v2' in their browser.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
