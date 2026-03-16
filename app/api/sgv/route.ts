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

  // Compute delta between consecutive readings (per minute, matching xDrip format)
  const entries = readings.rows.map((row, i) => {
    const ts = Number(row.ts);
    const sgv = Number(row.sgv);
    let delta = 0;
    if (i < readings.rows.length - 1) {
      const prevSgv = Number(readings.rows[i + 1].sgv);
      const prevTs = Number(readings.rows[i + 1].ts);
      const dtMin = (ts - prevTs) / 60000;
      if (dtMin > 0) {
        delta = (sgv - prevSgv) / dtMin;
      }
    }

    return {
      date: ts,
      sgv,
      delta: Math.round(delta * 1000) / 1000,
      direction: row.direction as string,
      units_hint: "mmol",
    };
  });

  return NextResponse.json(entries, {
    headers: { "Cache-Control": "no-cache, no-store" },
  });
}
