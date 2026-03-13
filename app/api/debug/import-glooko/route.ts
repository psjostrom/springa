import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

const MMOL_TO_MGDL = 18.0182;

interface GlookoReading {
  ts: number;
  mmol: number;
  sgv: number;
  direction: string;
}

function parseGlookoCSV(content: string): GlookoReading[] {
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

    // Parse timestamp as local time
    const [datePart, timePart] = timestamp.split(" ");
    if (!datePart || !timePart) continue;

    const localDate = new Date(`${datePart}T${timePart}:00`);
    const ts = localDate.getTime();
    if (isNaN(ts)) continue;

    readings.push({
      ts,
      mmol,
      sgv: Math.round(mmol * MMOL_TO_MGDL),
      direction: "Flat",
    });
  }

  return readings;
}

export async function POST(request: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    let allReadings: GlookoReading[] = [];
    const fileResults: { name: string; count: number }[] = [];

    for (const file of files) {
      const content = await file.text();
      const readings = parseGlookoCSV(content);
      fileResults.push({ name: file.name, count: readings.length });
      allReadings = allReadings.concat(readings);
    }

    if (allReadings.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No valid readings found in files",
        files: fileResults,
      });
    }

    // Sort and deduplicate
    allReadings.sort((a, b) => a.ts - b.ts);
    const seen = new Set<number>();
    const unique = allReadings.filter((r) => {
      if (seen.has(r.ts)) return false;
      seen.add(r.ts);
      return true;
    });

    // Batch insert
    const BATCH_SIZE = 100;
    let inserted = 0;

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const chunk = unique.slice(i, i + BATCH_SIZE);
      await db().batch(
        chunk.map((r) => ({
          sql: `INSERT OR IGNORE INTO xdrip_readings (email, ts, mmol, sgv, direction)
                VALUES (?, ?, ?, ?, ?)`,
          args: [email, r.ts, r.mmol, r.sgv, r.direction],
        })),
        "write",
      );
      inserted += chunk.length;
    }

    const oldest = new Date(unique[0].ts);
    const newest = new Date(unique[unique.length - 1].ts);

    return NextResponse.json({
      success: true,
      files: fileResults,
      totalParsed: allReadings.length,
      duplicatesRemoved: allReadings.length - unique.length,
      imported: inserted,
      dateRange: {
        oldest: oldest.toISOString().slice(0, 10),
        newest: newest.toISOString().slice(0, 10),
      },
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Import failed", details: String(error) },
      { status: 500 },
    );
  }
}
