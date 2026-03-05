/**
 * Diagnostic script: Check if xDrip DB has coverage for all runs with BG stream data.
 *
 * Run with: npx tsx scripts/check-bg-coverage.ts
 */

import { db } from "../lib/db";

interface CacheRow {
  activity_id: string;
  activity_date: string;
  glucose: string;
}

interface XdripRow {
  ts: number;
  mmol: number;
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/check-bg-coverage.ts <email>");
    process.exit(1);
  }

  console.log(`Checking BG coverage for ${email}\n`);

  // Get all cached activities with glucose data
  const cacheResult = await db().execute({
    sql: `SELECT activity_id, activity_date, glucose
          FROM bg_cache
          WHERE email = ? AND glucose != '[]'
          ORDER BY activity_date DESC`,
    args: [email],
  });

  const cachedRuns = cacheResult.rows as unknown as CacheRow[];
  console.log(`Found ${cachedRuns.length} runs with stream BG data in cache\n`);

  if (cachedRuns.length === 0) {
    console.log("No cached runs to check.");
    return;
  }

  // For each run, check if we have xDrip readings in that time window
  let withXdrip = 0;
  let withoutXdrip = 0;
  const gaps: string[] = [];

  for (const run of cachedRuns) {
    const glucose = JSON.parse(run.glucose) as { time: number; value: number }[];
    if (glucose.length === 0) continue;

    // Estimate run duration from glucose array (time is in minutes)
    const durationMin = glucose[glucose.length - 1].time - glucose[0].time;

    // We need the actual run start timestamp. activity_date is YYYY-MM-DD.
    // Without exact start time, we'll check if there's ANY xDrip data on that date.
    const dateStr = run.activity_date;
    const dayStart = new Date(dateStr + "T00:00:00Z").getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const xdripResult = await db().execute({
      sql: `SELECT ts, mmol FROM xdrip_readings
            WHERE email = ? AND ts >= ? AND ts < ?
            ORDER BY ts`,
      args: [email, dayStart, dayEnd],
    });

    const xdripReadings = xdripResult.rows as unknown as XdripRow[];

    if (xdripReadings.length === 0) {
      withoutXdrip++;
      gaps.push(`${dateStr} (${run.activity_id}): NO xDrip data`);
    } else {
      withXdrip++;
      console.log(`✓ ${dateStr}: ${glucose.length} stream pts, ${xdripReadings.length} xDrip readings`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Runs with xDrip data: ${withXdrip}`);
  console.log(`Runs WITHOUT xDrip data: ${withoutXdrip}`);

  if (gaps.length > 0) {
    console.log(`\n--- Gaps (no xDrip data) ---`);
    for (const gap of gaps) {
      console.log(`  ${gap}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
