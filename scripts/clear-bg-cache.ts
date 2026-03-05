/**
 * Clear bg_cache table to force rebuild with xDrip data.
 *
 * Usage: npx tsx scripts/clear-bg-cache.ts [email]
 *
 * If email is provided, only clears cache for that user.
 * If no email, clears all cache entries.
 */

import { db } from "../lib/db";

async function main() {
  const email = process.argv[2];

  if (email) {
    console.log(`Clearing bg_cache for ${email}...`);
    const result = await db().execute({
      sql: "DELETE FROM bg_cache WHERE email = ?",
      args: [email],
    });
    console.log(`Deleted ${result.rowsAffected} entries`);
  } else {
    console.log("Clearing all bg_cache entries...");
    const result = await db().execute({
      sql: "DELETE FROM bg_cache",
      args: [],
    });
    console.log(`Deleted ${result.rowsAffected} entries`);
  }

  console.log("\nDone! Cache will rebuild with xDrip data on next page load.");
  console.log("Note: Users should also clear localStorage keys 'bgcache' and 'bgcache_v2' in their browser.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
