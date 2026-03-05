import { createClient } from "@libsql/client";
import * as fs from "fs";

// Load env
const envPath = ".env.local";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function main() {
  // Read existing data
  const existing = await db.execute("SELECT email, latest_activity_id, patterns_text, analyzed_at FROM bg_patterns");
  console.log(`Found ${existing.rows.length} existing pattern(s)`);

  for (const row of existing.rows) {
    console.log(`  email=${row.email}, activity=${row.latest_activity_id}, analyzed=${new Date(row.analyzed_at as number).toISOString()}`);
  }

  // Recreate table with new schema
  await db.execute("ALTER TABLE bg_patterns RENAME TO bg_patterns_old");

  await db.execute(`CREATE TABLE bg_patterns (
    email              TEXT NOT NULL,
    latest_activity_id TEXT NOT NULL,
    run_count          INTEGER NOT NULL,
    patterns_text      TEXT NOT NULL,
    analyzed_at        INTEGER NOT NULL,
    PRIMARY KEY (email, latest_activity_id)
  )`);

  // Migrate existing data (run_count unknown for old rows, use 0)
  for (const row of existing.rows) {
    await db.execute({
      sql: "INSERT INTO bg_patterns (email, latest_activity_id, run_count, patterns_text, analyzed_at) VALUES (?, ?, ?, ?, ?)",
      args: [row.email, row.latest_activity_id, 0, row.patterns_text, row.analyzed_at],
    });
  }

  console.log(`Migrated ${existing.rows.length} row(s) to new schema`);

  // Drop old table
  await db.execute("DROP TABLE bg_patterns_old");
  console.log("Done — old table dropped");
}

main().catch(console.error);
