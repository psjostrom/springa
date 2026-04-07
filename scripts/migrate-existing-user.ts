/**
 * One-time script to migrate Per's credentials from env vars to DB.
 *
 * Run with:
 *   CREDENTIALS_ENCRYPTION_KEY=<key> \
 *   TURSO_DATABASE_URL=<url> \
 *   TURSO_AUTH_TOKEN=<token> \
 *   INTERVALS_API_KEY=<key> \
 *   MYLIFE_EMAIL=<email> \
 *   MYLIFE_PASSWORD=<pass> \
 *   npx tsx scripts/migrate-existing-user.ts
 */

import { createClient } from "@libsql/client";
import { encrypt } from "../lib/credentials";
import { createHash, randomBytes } from "crypto";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function migrate() {
  const encKey = process.env.CREDENTIALS_ENCRYPTION_KEY!;
  if (!encKey || encKey.length !== 64) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string");
  }

  const email = "persinternetpost@gmail.com";

  // 1. ALTER TABLE — add new columns (idempotent)
  const alters = [
    "ALTER TABLE user_settings ADD COLUMN diabetes_mode INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE user_settings ADD COLUMN display_name TEXT",
    "ALTER TABLE user_settings ADD COLUMN timezone TEXT DEFAULT 'Europe/Stockholm'",
    "ALTER TABLE user_settings ADD COLUMN intervals_api_key TEXT",
    "ALTER TABLE user_settings ADD COLUMN run_days TEXT",
    "ALTER TABLE user_settings ADD COLUMN mylife_email TEXT",
    "ALTER TABLE user_settings ADD COLUMN mylife_password TEXT",
    "ALTER TABLE user_settings ADD COLUMN nightscout_secret TEXT",
    "ALTER TABLE user_settings ADD COLUMN onboarding_complete INTEGER NOT NULL DEFAULT 0",
  ];

  for (const sql of alters) {
    try {
      await db.execute(sql);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column")) throw e;
    }
  }

  // Create index
  await db.execute("CREATE INDEX IF NOT EXISTS idx_nightscout_secret ON user_settings(nightscout_secret)");

  // 2. Generate new Nightscout secret
  const newNsSecret = randomBytes(32).toString("hex");
  const nsHash = createHash("sha256").update(newNsSecret).digest("hex");

  // 3. Encrypt credentials
  const intervalsKey = process.env.INTERVALS_API_KEY;
  const mylifeEmail = process.env.MYLIFE_EMAIL;
  const mylifePassword = process.env.MYLIFE_PASSWORD;

  const encIntervalsKey = intervalsKey ? encrypt(intervalsKey, encKey) : null;
  const encMylifePassword = mylifePassword ? encrypt(mylifePassword, encKey) : null;

  // 4. Update existing user
  await db.execute({
    sql: `UPDATE user_settings SET
      diabetes_mode = 1,
      onboarding_complete = 1,
      timezone = 'Europe/Stockholm',
      intervals_api_key = ?,
      mylife_email = ?,
      mylife_password = ?,
      nightscout_secret = ?
    WHERE email = ?`,
    args: [encIntervalsKey, mylifeEmail ?? null, encMylifePassword, nsHash, email],
  });

  console.log("Migration complete.");
  console.log(`New Nightscout secret (configure in Strimma): ${newNsSecret}`);
  console.log("Remove these env vars: INTERVALS_API_KEY, MYLIFE_EMAIL, MYLIFE_PASSWORD, CGM_SECRET, TIMEZONE");
}

migrate().catch(console.error);
