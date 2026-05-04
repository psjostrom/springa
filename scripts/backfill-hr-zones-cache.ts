/**
 * One-time backfill: populate user_settings.hr_zones/max_hr by fetching
 * Intervals.icu athlete profile for users with saved Intervals credentials.
 *
 * Run: npx tsx --env-file=.env.local scripts/backfill-hr-zones-cache.ts
 */
import { db } from "../lib/db";
import { getUserCredentials } from "../lib/credentials";
import { getUserSettings } from "../lib/settings";
import { getUserWorkoutEstimationContext } from "../lib/workoutEstimationContext";

interface UserRow {
  email: string;
}

async function main() {
  const rows = await db().execute("SELECT email FROM user_settings");
  const users = rows.rows as unknown as UserRow[];

  let attempted = 0;
  let skippedNoApiKey = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const { email } of users) {
    attempted += 1;
    try {
      const creds = await getUserCredentials(email);
      if (!creds?.intervalsApiKey) {
        skippedNoApiKey += 1;
        console.log(`[skip] ${email}: no intervals api key`);
        continue;
      }

      const before = await getUserSettings(email);
      const hadBefore = !!(
        before.hrZones?.length === 5 || before.maxHr != null
      );

      await getUserWorkoutEstimationContext(
        email,
        creds.intervalsApiKey,
        before,
      );

      const after = await getUserSettings(email);
      const hasAfter = !!(after.hrZones?.length === 5 || after.maxHr != null);

      if (!hadBefore && hasAfter) {
        updated += 1;
        console.log(`[updated] ${email}`);
      } else {
        unchanged += 1;
        console.log(`[unchanged] ${email}`);
      }
    } catch (error) {
      failed += 1;
      console.error(
        `[failed] ${email}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log("\nBackfill summary:");
  console.log(`attempted=${attempted}`);
  console.log(`skipped_no_api_key=${skippedNoApiKey}`);
  console.log(`updated=${updated}`);
  console.log(`unchanged=${unchanged}`);
  console.log(`failed=${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
