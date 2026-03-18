/**
 * Import Glooko CGM export CSVs into bg_readings table.
 *
 * Usage: npx tsx scripts/import-glooko-cgm.ts <email> <csv_file> [csv_file2...]
 *
 * Example:
 *   npx tsx scripts/import-glooko-cgm.ts per@example.com export_glooko/cgm_data_1.csv export_glooko/cgm_data_2.csv
 */

import { readFileSync } from "fs";
import { db } from "../lib/db";

const MMOL_TO_MGDL = 18.0182;

interface GlookoReading {
  ts: number;       // milliseconds
  mmol: number;
  sgv: number;      // mg/dL
  direction: string;
}

function parseGlookoCSV(filePath: string, timezone: string): GlookoReading[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const readings: GlookoReading[] = [];

  // Skip header lines (line 0 is metadata, line 1 is column headers)
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Format: "2026-03-05 13:11,6.3,CamAPS Dexcom G6"
    const [timestamp, mmolStr] = line.split(",");
    if (!timestamp || !mmolStr) continue;

    const mmol = parseFloat(mmolStr);
    if (isNaN(mmol)) continue;

    // Parse timestamp as local time in the given timezone
    // Format: "YYYY-MM-DD HH:mm"
    const [datePart, timePart] = timestamp.split(" ");
    if (!datePart || !timePart) continue;

    // Create date in local timezone
    const localDate = new Date(`${datePart}T${timePart}:00`);
    const ts = localDate.getTime();

    if (isNaN(ts)) continue;

    readings.push({
      ts,
      mmol,
      sgv: Math.round(mmol * MMOL_TO_MGDL),
      direction: "Flat", // Glooko doesn't export direction, we'll compute later if needed
    });
  }

  return readings;
}

async function importReadings(email: string, readings: GlookoReading[]): Promise<number> {
  if (readings.length === 0) return 0;

  // Sort by timestamp
  readings.sort((a, b) => a.ts - b.ts);

  // Deduplicate by timestamp
  const seen = new Set<number>();
  const unique = readings.filter((r) => {
    if (seen.has(r.ts)) return false;
    seen.add(r.ts);
    return true;
  });

  console.log(`Importing ${unique.length} unique readings (${readings.length - unique.length} duplicates removed)`);

  // Batch insert
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    await db().batch(
      chunk.map((r) => ({
        sql: `INSERT OR IGNORE INTO bg_readings (email, ts, mmol, sgv, direction)
              VALUES (?, ?, ?, ?, ?)`,
        args: [email, r.ts, r.mmol, r.sgv, r.direction],
      })),
      "write",
    );
    inserted += chunk.length;

    if (i % 1000 === 0) {
      console.log(`  Progress: ${inserted}/${unique.length}`);
    }
  }

  return inserted;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: npx tsx scripts/import-glooko-cgm.ts <email> <csv_file> [csv_file2...]");
    process.exit(1);
  }

  const email = args[0];
  const files = args.slice(1);

  console.log(`Importing Glooko CGM data for ${email}`);
  console.log(`Files: ${files.join(", ")}`);

  let allReadings: GlookoReading[] = [];

  for (const file of files) {
    console.log(`\nParsing ${file}...`);
    const readings = parseGlookoCSV(file, "Europe/Stockholm");
    console.log(`  Found ${readings.length} readings`);

    if (readings.length > 0) {
      const oldest = new Date(Math.min(...readings.map((r) => r.ts)));
      const newest = new Date(Math.max(...readings.map((r) => r.ts)));
      console.log(`  Date range: ${oldest.toISOString().slice(0, 10)} to ${newest.toISOString().slice(0, 10)}`);
    }

    allReadings = allReadings.concat(readings);
  }

  console.log(`\nTotal readings: ${allReadings.length}`);

  if (allReadings.length === 0) {
    console.log("No readings to import.");
    process.exit(0);
  }

  const imported = await importReadings(email, allReadings);
  console.log(`\nDone! Imported ${imported} readings.`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
