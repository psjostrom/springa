import { createClient } from "@libsql/client";
import * as fs from "fs";
import { recomputeDirections, type BGReading } from "../lib/cgm";

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
  // Read all readings per email, ordered chronologically
  const emails = await db.execute(
    "SELECT DISTINCT email FROM bg_readings",
  );

  for (const row of emails.rows) {
    const email = row.email as string;

    const result = await db.execute({
      sql: "SELECT ts, mmol, sgv, direction, delta FROM bg_readings WHERE email = ? ORDER BY ts",
      args: [email],
    });

    const readings: BGReading[] = result.rows.map((r) => ({
      ts: r.ts as number,
      mmol: r.mmol as number,
      sgv: r.sgv as number,
      direction: r.direction as string,
      delta: r.delta as number,
    }));

    console.log(`${email}: ${readings.length} readings`);

    // Snapshot before
    const before = readings.map((r) => ({ ts: r.ts, delta: r.delta, direction: r.direction }));

    // Recompute direction + delta from sgv values
    recomputeDirections(readings);

    // Find changed rows
    const changed = readings.filter((r, i) => {
      return r.delta !== before[i].delta || r.direction !== before[i].direction;
    });

    console.log(`  ${changed.length} readings need delta/direction update`);

    if (changed.length === 0) continue;

    // Update in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < changed.length; i += BATCH_SIZE) {
      const chunk = changed.slice(i, i + BATCH_SIZE);
      await db.batch(
        chunk.map((r) => ({
          sql: "UPDATE bg_readings SET delta = ?, direction = ? WHERE email = ? AND ts = ?",
          args: [r.delta, r.direction, email, r.ts],
        })),
        "write",
      );
    }

    // Verify
    const verify = await db.execute({
      sql: "SELECT COUNT(*) as c FROM bg_readings WHERE email = ? AND delta = 0",
      args: [email],
    });
    const zeroCount = verify.rows[0].c as number;
    const firstReadings = await db.execute({
      sql: "SELECT COUNT(*) as c FROM bg_readings WHERE email = ? AND ts = (SELECT MIN(ts) FROM bg_readings WHERE email = ?)",
      args: [email, email],
    });
    // The very first reading(s) will legitimately have delta=0 (no prior reading)
    console.log(`  ${zeroCount} readings still have delta=0 (first reading or isolated points)`);
  }

  console.log("Done");
}

main().catch(console.error);
