import { NextResponse } from "next/server";
import { validateXdripSecret, unauthorized } from "@/lib/apiHelpers";
import { db } from "@/lib/db";
import { recomputeDirections } from "@/lib/xdrip";
import type { XdripReading } from "@/lib/xdrip";

/**
 * GET /api/debug/compare-readings — Compare xDrip vs Strimma data side-by-side.
 *
 * Used during Strimma validation to check:
 * - Completeness: are both apps pushing every reading?
 * - Gaps: is either app dropping data?
 * - Direction quality: how does each app's direction compare to Springa's
 *   independent recomputation from the same sgv values?
 *
 * Auth: api-secret header (same as xDrip/Strimma push endpoints).
 * Query: ?hours=N (default 24, max 168)
 */
export async function GET(req: Request) {
  if (!validateXdripSecret(req.headers.get("api-secret"))) {
    return unauthorized();
  }

  const url = new URL(req.url);
  const hours = Math.min(
    Math.max(parseInt(url.searchParams.get("hours") ?? "24", 10) || 24, 1),
    168,
  );

  const result = await db().execute({ sql: "SELECT email FROM user_settings LIMIT 1", args: [] });
  const email = result.rows[0]?.email as string;
  if (!email) {
    return NextResponse.json({ error: "No user configured" }, { status: 401 });
  }

  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  // Query both tables in parallel. Gracefully handle strimma_readings not
  // existing yet (first deploy before first Strimma push).
  const xdripResult = await db().execute({
    sql: "SELECT ts, sgv, direction FROM xdrip_readings WHERE email = ? AND ts >= ? ORDER BY ts",
    args: [email, cutoff],
  });

  let strimmaResult;
  try {
    strimmaResult = await db().execute({
      sql: "SELECT ts, sgv, direction FROM strimma_readings WHERE email = ? AND ts >= ? ORDER BY ts",
      args: [email, cutoff],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("no such table")) {
      return NextResponse.json({
        hours,
        error: "strimma_readings table does not exist yet — deploy schema first or wait for first Strimma push",
        xdrip: { count: xdripResult.rows.length },
      });
    }
    throw e;
  }

  const xdripReadings = xdripResult.rows.map((r) => ({
    ts: r.ts as number,
    sgv: r.sgv as number,
    direction: r.direction as string,
  }));

  const strimmaReadings = strimmaResult.rows.map((r) => ({
    ts: r.ts as number,
    sgv: r.sgv as number,
    direction: r.direction as string,
  }));

  // --- Completeness: which readings exist in one but not the other ---
  const xdripTs = new Set(xdripReadings.map((r) => r.ts));
  const strimmaTs = new Set(strimmaReadings.map((r) => r.ts));

  const missingInStrimma = xdripReadings
    .filter((r) => !strimmaTs.has(r.ts))
    .map((r) => ({ ts: r.ts, iso: new Date(r.ts).toISOString() }));
  const missingInXdrip = strimmaReadings
    .filter((r) => !xdripTs.has(r.ts))
    .map((r) => ({ ts: r.ts, iso: new Date(r.ts).toISOString() }));

  // --- Direction quality: compare each source's stored direction against
  // Springa's independent recomputation from that source's own sgv values.
  // This measures algorithm correctness, not data sync. ---

  const countDirectionMismatches = (readings: { ts: number; sgv: number; direction: string }[]) => {
    if (readings.length === 0) return 0;

    // Build XdripReading-compatible array for recomputeDirections
    const forRecompute: XdripReading[] = readings.map((r) => ({
      ts: r.ts,
      sgv: r.sgv,
      mmol: Math.round((r.sgv / 18.0182) * 10) / 10,
      direction: r.direction, // will be overwritten by recompute
    }));

    // Deep copy directions before recompute overwrites them
    const storedDirections = readings.map((r) => r.direction);

    recomputeDirections(forRecompute);

    let mismatches = 0;
    for (let i = 0; i < forRecompute.length; i++) {
      if (forRecompute[i].direction === "NONE") continue; // skip non-computable
      if (storedDirections[i] !== forRecompute[i].direction) {
        mismatches++;
      }
    }
    return mismatches;
  };

  // --- Gaps: Libre 3 sends every ~1 minute. A gap > 2 minutes means
  // at least one reading was lost. ---
  const GAP_THRESHOLD_MS = 2 * 60 * 1000;

  const countGaps = (readings: { ts: number }[]) => {
    let gaps = 0;
    for (let i = 1; i < readings.length; i++) {
      if (readings[i].ts - readings[i - 1].ts > GAP_THRESHOLD_MS) gaps++;
    }
    return gaps;
  };

  // --- Shared readings: how many timestamps exist in both tables ---
  let sharedCount = 0;
  for (const xr of xdripReadings) {
    if (strimmaTs.has(xr.ts)) sharedCount++;
  }

  return NextResponse.json({
    hours,
    shared_readings: sharedCount,
    xdrip: {
      count: xdripReadings.length,
      gaps: countGaps(xdripReadings),
      direction_mismatches_vs_recomputed: countDirectionMismatches(xdripReadings),
    },
    strimma: {
      count: strimmaReadings.length,
      gaps: countGaps(strimmaReadings),
      direction_mismatches_vs_recomputed: countDirectionMismatches(strimmaReadings),
    },
    missing_in_strimma: missingInStrimma,
    missing_in_xdrip: missingInXdrip,
  });
}
