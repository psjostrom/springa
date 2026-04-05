/**
 * Admin provisioning script — approve users and configure credentials.
 *
 * Usage:
 *   npx tsx scripts/provision-user.ts --approve user@example.com
 *   npx tsx scripts/provision-user.ts --email user@example.com --name "Johan" --approve
 *   npx tsx scripts/provision-user.ts --email user@example.com --approve --diabetes-mode \
 *     --ns-url "https://scout.springa.run" --ns-secret "my-secret" \
 *     --intervals-key "abc123"
 *
 * Run with .env.local loaded:
 *   npx tsx --env-file=.env.local scripts/provision-user.ts [args]
 */

import { createClient } from "@libsql/client";
import { encrypt } from "../lib/credentials";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

function getEncKey(): string {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string");
  }
  return key;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: Record<string, string | boolean> = {};
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    if (arg === "--approve") {
      opts.approve = true;
      // Next arg might be an email (positional)
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        opts.email = args[i + 1];
        i++;
      }
    } else if (arg === "--diabetes-mode") {
      opts.diabetesMode = true;
    } else if (arg === "--email" && i + 1 < args.length) {
      opts.email = args[++i];
    } else if (arg === "--name" && i + 1 < args.length) {
      opts.name = args[++i];
    } else if (arg === "--timezone" && i + 1 < args.length) {
      opts.timezone = args[++i];
    } else if (arg === "--ns-url" && i + 1 < args.length) {
      opts.nsUrl = args[++i];
    } else if (arg === "--ns-secret" && i + 1 < args.length) {
      opts.nsSecret = args[++i];
    } else if (arg === "--intervals-key" && i + 1 < args.length) {
      opts.intervalsKey = args[++i];
    } else if (!arg.startsWith("--")) {
      opts.email = arg;
    }
    i++;
  }

  return opts;
}

async function provision() {
  const opts = parseArgs();
  const email = opts.email as string | undefined;

  if (!email) {
    console.error("Usage: npx tsx scripts/provision-user.ts --approve user@example.com");
    console.error("       npx tsx scripts/provision-user.ts --email user@example.com --name Johan --approve");
    process.exit(1);
  }

  const encKey = getEncKey();

  // Check if user exists
  const existing = await db.execute({
    sql: "SELECT email, approved, diabetes_mode, display_name FROM user_settings WHERE email = ?",
    args: [email],
  });

  if (existing.rows.length === 0) {
    // Create new user
    console.log(`Creating new user: ${email}`);
    await db.execute({
      sql: `INSERT INTO user_settings (email, approved, diabetes_mode, display_name, timezone, onboarding_complete)
            VALUES (?, ?, ?, ?, ?, 0)`,
      args: [
        email,
        opts.approve ? 1 : 0,
        opts.diabetesMode ? 1 : 0,
        (opts.name as string) ?? null,
        (opts.timezone as string) ?? "Europe/Stockholm",
      ],
    });
  } else {
    console.log(`User exists: ${email}`);
  }

  // Apply updates
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (opts.approve) {
    sets.push("approved = 1");
    console.log("  → Approved");
  }
  if (opts.diabetesMode) {
    sets.push("diabetes_mode = 1");
    console.log("  → Diabetes mode enabled");
  }
  if (opts.name) {
    sets.push("display_name = ?");
    args.push(opts.name as string);
    console.log(`  → Name: ${opts.name}`);
  }
  if (opts.timezone) {
    sets.push("timezone = ?");
    args.push(opts.timezone as string);
    console.log(`  → Timezone: ${opts.timezone}`);
  }
  if (opts.nsUrl) {
    sets.push("nightscout_url = ?");
    args.push(opts.nsUrl as string);
    console.log(`  → NS URL: ${opts.nsUrl}`);
  }
  if (opts.nsSecret) {
    sets.push("nightscout_secret = ?");
    args.push(encrypt(opts.nsSecret as string, encKey));
    console.log("  → NS secret: (encrypted)");
  }
  if (opts.intervalsKey) {
    sets.push("intervals_api_key = ?");
    args.push(encrypt(opts.intervalsKey as string, encKey));
    console.log("  → Intervals.icu key: (encrypted)");
  }

  if (sets.length > 0) {
    args.push(email);
    await db.execute({
      sql: `UPDATE user_settings SET ${sets.join(", ")} WHERE email = ?`,
      args,
    });
  }

  // Show final state
  const result = await db.execute({
    sql: "SELECT email, approved, diabetes_mode, display_name, timezone, nightscout_url, onboarding_complete FROM user_settings WHERE email = ?",
    args: [email],
  });

  if (result.rows.length > 0) {
    const row = result.rows[0];
    console.log("\nProvisioned user:");
    console.log(`  Email:      ${row.email}`);
    console.log(`  Approved:   ${row.approved === 1 ? "yes" : "no"}`);
    console.log(`  Diabetes mode: ${row.diabetes_mode === 1 ? "yes" : "no"}`);
    console.log(`  Name:       ${row.display_name ?? "(not set)"}`);
    console.log(`  Timezone:   ${row.timezone ?? "Europe/Stockholm"}`);
    console.log(`  NS URL:     ${row.nightscout_url ?? "(not set)"}`);
    console.log(`  Onboarded:  ${row.onboarding_complete === 1 ? "yes" : "no"}`);
  }
}

provision().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
