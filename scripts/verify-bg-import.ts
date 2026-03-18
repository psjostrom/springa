/**
 * Verify xDrip import data integrity
 *
 * Usage: npx tsx scripts/verify-xdrip-import.ts <email>
 */

import { db } from "../lib/db";

const MMOL_TO_MGDL = 18.0182;

interface Reading {
  ts: number;
  mmol: number;
  sgv: number;
  direction: string;
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/verify-xdrip-import.ts <email>");
    process.exit(1);
  }

  console.log(`\n=== xDrip Data Verification for ${email} ===\n`);

  // 1. Total count and date range
  const countResult = await db().execute({
    sql: "SELECT COUNT(*) as total FROM bg_readings WHERE email = ?",
    args: [email],
  });
  const total = (countResult.rows[0] as unknown as { total: number }).total;

  const rangeResult = await db().execute({
    sql: `SELECT MIN(ts) as oldest, MAX(ts) as newest FROM bg_readings WHERE email = ?`,
    args: [email],
  });
  const range = rangeResult.rows[0] as unknown as { oldest: number; newest: number };

  console.log(`Total readings: ${total}`);
  console.log(`Date range: ${new Date(range.oldest).toISOString()} to ${new Date(range.newest).toISOString()}`);
  console.log(`           ${new Date(range.oldest).toLocaleString("sv-SE")} to ${new Date(range.newest).toLocaleString("sv-SE")} (local)`);

  // 2. Direction distribution - key indicator of data source
  console.log("\n--- Direction Distribution ---");
  const dirResult = await db().execute({
    sql: `SELECT direction, COUNT(*) as cnt FROM bg_readings WHERE email = ? GROUP BY direction ORDER BY cnt DESC`,
    args: [email],
  });
  for (const row of dirResult.rows) {
    const r = row as unknown as { direction: string; cnt: number };
    const pct = ((r.cnt / total) * 100).toFixed(1);
    console.log(`  ${r.direction || "(null)"}: ${r.cnt} (${pct}%)`);
  }
  console.log("\n  Note: 'Flat' = Glooko import, computed directions (DoubleUp, Up, etc) = real CGM");

  // 3. Check specific timestamps from CSV to verify import
  console.log("\n--- Timestamp Verification ---");

  // Sample timestamps from Glooko CSV (local time in Sweden)
  const testCases = [
    { csv: "2026-03-05 13:11", mmol: 6.3, label: "Recent (cgm_data_1)" },
    { csv: "2026-03-05 12:56", mmol: 6.8, label: "Recent (cgm_data_1)" },
    { csv: "2025-12-25 01:57", mmol: 11.2, label: "Christmas (cgm_data_2)" },
    { csv: "2025-12-25 00:52", mmol: 14.0, label: "Christmas (cgm_data_2)" },
  ];

  for (const tc of testCases) {
    // Parse the CSV timestamp as local time (same as import script)
    const [datePart, timePart] = tc.csv.split(" ");
    const localDate = new Date(`${datePart}T${timePart}:00`);
    const ts = localDate.getTime();

    const result = await db().execute({
      sql: `SELECT ts, mmol, sgv, direction FROM bg_readings WHERE email = ? AND ts = ?`,
      args: [email, ts],
    });

    if (result.rows.length === 0) {
      console.log(`  ❌ ${tc.label}: ${tc.csv} (ts=${ts}) - NOT FOUND`);
    } else {
      const r = result.rows[0] as unknown as Reading;
      const match = Math.abs(r.mmol - tc.mmol) < 0.01;
      const icon = match ? "✅" : "⚠️";
      console.log(`  ${icon} ${tc.label}: ${tc.csv}`);
      console.log(`     CSV mmol: ${tc.mmol}, DB mmol: ${r.mmol}, match: ${match}`);
      console.log(`     Direction: ${r.direction}, SGV: ${r.sgv}`);
    }
  }

  // 4. Check for real CGM data (should have computed directions, not "Flat")
  console.log("\n--- Real xDrip Data Check ---");
  const bgRealResult = await db().execute({
    sql: `SELECT ts, mmol, direction FROM bg_readings
          WHERE email = ? AND direction != 'Flat'
          ORDER BY ts DESC LIMIT 10`,
    args: [email],
  });

  if (bgRealResult.rows.length === 0) {
    console.log("  ⚠️ No real CGM data found (all entries have 'Flat' direction)");
  } else {
    console.log("  Found real CGM entries (with computed directions):");
    for (const row of bgRealResult.rows) {
      const r = row as unknown as Reading;
      console.log(`    ${new Date(r.ts).toLocaleString("sv-SE")} - ${r.mmol} mmol/L - ${r.direction}`);
    }
  }

  // 5. Check overlap period - are there entries with different directions for similar timestamps?
  console.log("\n--- Overlap Analysis (Feb 19-20, when CGM went live) ---");

  // Feb 19 is when real CGM started
  const overlapStart = new Date("2026-02-19T00:00:00").getTime();
  const overlapEnd = new Date("2026-02-21T00:00:00").getTime();

  const overlapResult = await db().execute({
    sql: `SELECT ts, mmol, direction FROM bg_readings
          WHERE email = ? AND ts >= ? AND ts < ?
          ORDER BY ts LIMIT 50`,
    args: [email, overlapStart, overlapEnd],
  });

  const flatCount = (overlapResult.rows as unknown as Reading[]).filter(r => r.direction === "Flat").length;
  const computedCount = overlapResult.rows.length - flatCount;

  console.log(`  Readings in overlap window: ${overlapResult.rows.length}`);
  console.log(`  Glooko-imported (Flat): ${flatCount}`);
  console.log(`  Real xDrip (computed): ${computedCount}`);

  if (flatCount > 0 && computedCount > 0) {
    console.log("  ✅ Both sources present - no overwriting occurred");
  } else if (computedCount > 0) {
    console.log("  ✅ Real CGM data preserved");
  } else {
    console.log("  ⚠️ Only Glooko data found - xDrip may have been overwritten or not present");
  }

  // 6. Sample from pre-CGM period (should all be Flat)
  console.log("\n--- Pre-CGM Period (Feb 10, should be all Glooko) ---");
  const preBGResult = await db().execute({
    sql: `SELECT ts, mmol, direction FROM bg_readings
          WHERE email = ? AND ts >= ? AND ts < ?
          ORDER BY ts LIMIT 10`,
    args: [
      email,
      new Date("2026-02-10T10:00:00").getTime(),
      new Date("2026-02-10T12:00:00").getTime(),
    ],
  });

  for (const row of preBGResult.rows) {
    const r = row as unknown as Reading;
    console.log(`  ${new Date(r.ts).toLocaleString("sv-SE")} - ${r.mmol} mmol/L - ${r.direction}`);
  }

  const allFlat = (preBGResult.rows as unknown as Reading[]).every(r => r.direction === "Flat");
  console.log(allFlat ? "  ✅ All entries from Glooko import" : "  ⚠️ Mixed sources in pre-CGM period");

  // 7. Check for duplicate timestamps (shouldn't exist due to primary key)
  console.log("\n--- Duplicate Check ---");
  const dupResult = await db().execute({
    sql: `SELECT ts, COUNT(*) as cnt FROM bg_readings
          WHERE email = ? GROUP BY ts HAVING cnt > 1 LIMIT 5`,
    args: [email],
  });

  if (dupResult.rows.length === 0) {
    console.log("  ✅ No duplicate timestamps found");
  } else {
    console.log(`  ⚠️ Found ${dupResult.rows.length} duplicate timestamps`);
  }

  console.log("\n=== Verification Complete ===\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
