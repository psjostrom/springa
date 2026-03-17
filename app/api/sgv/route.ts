import { NextResponse } from "next/server";
import { validateXdripSecret } from "@/lib/apiHelpers";
import { db } from "@/lib/db";

/**
 * GET /api/sgv — xDrip-compatible sgv.json endpoint serving from Turso.
 *
 * Designed for Garmin CIQ apps (SugarRun, SugarWave, SuperStable) that
 * can't reliably reach xDrip's local web server via the GCM BLE proxy.
 *
 * Query params:
 *   count — number of readings (default 24, max 360)
 *
 * Auth: api-secret header (same as xDrip routes).
 */
export async function GET(req: Request) {
  if (!validateXdripSecret(req.headers.get("api-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const count = Math.min(
    Math.max(parseInt(url.searchParams.get("count") ?? "24", 10) || 24, 1),
    360,
  );

  const result = await db().execute({
    sql: "SELECT email FROM user_settings LIMIT 1",
    args: [],
  });
  const email = result.rows[0]?.email as string;
  if (!email) {
    return NextResponse.json([], { status: 200 });
  }

  const readings = await db().execute({
    sql: "SELECT ts, mmol, sgv, direction FROM xdrip_readings WHERE email = ? ORDER BY ts DESC LIMIT ?",
    args: [email, count],
  });

  // Build typed array for smoothed delta computation
  const rows = readings.rows.map((row) => ({
    ts: Number(row.ts),
    sgv: Number(row.sgv),
    direction: row.direction as string,
  }));

  // 3-point averaged sgv (matches recomputeDirections in lib/xdrip.ts)
  const avgSgv = (idx: number) => {
    const lo = Math.max(0, idx - 1);
    const hi = Math.min(rows.length - 1, idx + 1);
    let sum = 0, n = 0;
    for (let j = lo; j <= hi; j++) { sum += rows[j].sgv; n++; }
    return sum / n;
  };

  const WINDOW_MS = 5 * 60 * 1000;

  const entries = rows.map((row, i) => {
    let delta = 0;

    // Find reading closest to 5 min earlier (rows sorted DESC, so look forward)
    const targetTs = row.ts - WINDOW_MS;
    let pastIdx: number | null = null;
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].ts <= targetTs) {
        const prev = j - 1 > i ? j - 1 : null;
        pastIdx = prev != null && Math.abs(rows[prev].ts - targetTs) < Math.abs(rows[j].ts - targetTs) ? prev : j;
        break;
      }
    }

    if (pastIdx != null && row.ts - rows[pastIdx].ts <= 600000) {
      const dtMin = (row.ts - rows[pastIdx].ts) / 60000;
      if (dtMin > 0) {
        delta = (avgSgv(i) - avgSgv(pastIdx)) / dtMin;
      }
    }

    return {
      date: row.ts,
      sgv: row.sgv,
      delta: Math.round(delta * 1000) / 1000,
      direction: row.direction,
      units_hint: "mmol",
    };
  });

  return NextResponse.json(entries, {
    headers: { "Cache-Control": "no-cache, no-store" },
  });
}
