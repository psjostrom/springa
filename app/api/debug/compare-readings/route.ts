import { NextResponse } from "next/server";
import { validateXdripSecret, unauthorized } from "@/lib/apiHelpers";
import { db } from "@/lib/db";

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

  const [xdripResult, strimmaResult] = await Promise.all([
    db().execute({
      sql: "SELECT ts, sgv, direction FROM xdrip_readings WHERE email = ? AND ts >= ? ORDER BY ts",
      args: [email, cutoff],
    }),
    db().execute({
      sql: "SELECT ts, sgv, direction FROM strimma_readings WHERE email = ? AND ts >= ? ORDER BY ts",
      args: [email, cutoff],
    }),
  ]);

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

  const xdripTs = new Set(xdripReadings.map((r) => r.ts));
  const strimmaTs = new Set(strimmaReadings.map((r) => r.ts));

  const missingInStrimma = xdripReadings
    .filter((r) => !strimmaTs.has(r.ts))
    .map((r) => r.ts);
  const missingInXdrip = strimmaReadings
    .filter((r) => !xdripTs.has(r.ts))
    .map((r) => r.ts);

  const strimmaByTs = new Map(strimmaReadings.map((r) => [r.ts, r]));

  let xdripDirMismatches = 0;
  let sharedCount = 0;

  for (const xr of xdripReadings) {
    const sr = strimmaByTs.get(xr.ts);
    if (!sr) continue;
    sharedCount++;
    if (xr.direction !== sr.direction) {
      xdripDirMismatches++;
    }
  }

  const countGaps = (readings: { ts: number }[]) => {
    let gaps = 0;
    for (let i = 1; i < readings.length; i++) {
      if (readings[i].ts - readings[i - 1].ts > 5 * 60 * 1000) gaps++;
    }
    return gaps;
  };

  return NextResponse.json({
    hours,
    shared_readings: sharedCount,
    xdrip: {
      count: xdripReadings.length,
      gaps: countGaps(xdripReadings),
      direction_mismatches_vs_strimma: xdripDirMismatches,
    },
    strimma: {
      count: strimmaReadings.length,
      gaps: countGaps(strimmaReadings),
    },
    missing_in_strimma: missingInStrimma,
    missing_in_xdrip: missingInXdrip,
  });
}
