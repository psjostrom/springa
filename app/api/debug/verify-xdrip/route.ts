import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = session.user.email;

  // Get summary stats
  const countResult = await db().execute({
    sql: "SELECT COUNT(*) as total FROM xdrip_readings WHERE email = ?",
    args: [email],
  });
  const total = (countResult.rows[0] as unknown as { total: number }).total;

  // Get date range
  const rangeResult = await db().execute({
    sql: `SELECT
            MIN(ts) as oldest,
            MAX(ts) as newest
          FROM xdrip_readings WHERE email = ?`,
    args: [email],
  });
  const range = rangeResult.rows[0] as unknown as { oldest: number; newest: number };

  // Get sample readings from different periods
  // Early Feb (should be from Glooko import)
  const earlyFebResult = await db().execute({
    sql: `SELECT ts, mmol, sgv, direction
          FROM xdrip_readings
          WHERE email = ? AND ts >= ? AND ts < ?
          ORDER BY ts
          LIMIT 10`,
    args: [
      email,
      new Date("2026-02-10T00:00:00").getTime(),
      new Date("2026-02-10T01:00:00").getTime(),
    ],
  });

  // Late Feb (should have both Glooko and real xDrip)
  const lateFebResult = await db().execute({
    sql: `SELECT ts, mmol, sgv, direction
          FROM xdrip_readings
          WHERE email = ? AND ts >= ? AND ts < ?
          ORDER BY ts
          LIMIT 10`,
    args: [
      email,
      new Date("2026-02-20T12:00:00").getTime(),
      new Date("2026-02-20T13:00:00").getTime(),
    ],
  });

  // Check for duplicate timestamps (shouldn't exist due to primary key)
  const dupResult = await db().execute({
    sql: `SELECT ts, COUNT(*) as cnt
          FROM xdrip_readings
          WHERE email = ?
          GROUP BY ts
          HAVING cnt > 1
          LIMIT 5`,
    args: [email],
  });

  // Check direction values - Glooko imports have "Flat", real xDrip has computed directions
  const directionStats = await db().execute({
    sql: `SELECT direction, COUNT(*) as cnt
          FROM xdrip_readings
          WHERE email = ?
          GROUP BY direction
          ORDER BY cnt DESC`,
    args: [email],
  });

  // Check for any readings with suspicious values
  const suspiciousResult = await db().execute({
    sql: `SELECT ts, mmol, sgv
          FROM xdrip_readings
          WHERE email = ? AND (mmol < 2 OR mmol > 25 OR sgv < 36 OR sgv > 450)
          LIMIT 10`,
    args: [email],
  });

  // Sample comparison: readings around a known run start (Feb 10, 2026)
  // This helps verify timezone alignment
  const runSampleResult = await db().execute({
    sql: `SELECT ts, mmol, sgv, direction,
            datetime(ts/1000, 'unixepoch', 'localtime') as local_time
          FROM xdrip_readings
          WHERE email = ? AND ts >= ? AND ts < ?
          ORDER BY ts`,
    args: [
      email,
      new Date("2026-02-10T11:00:00").getTime(),
      new Date("2026-02-10T13:00:00").getTime(),
    ],
  });

  const formatSample = (rows: unknown[]) =>
    (rows as { ts: number; mmol: number; sgv: number; direction: string }[]).map((r) => ({
      time: new Date(r.ts).toISOString(),
      localTime: new Date(r.ts).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }),
      mmol: r.mmol,
      sgv: r.sgv,
      direction: r.direction,
    }));

  return NextResponse.json({
    summary: {
      totalReadings: total,
      dateRange: {
        oldest: new Date(range.oldest).toISOString(),
        newest: new Date(range.newest).toISOString(),
      },
    },
    directionStats: directionStats.rows,
    duplicates: dupResult.rows.length,
    suspiciousValues: suspiciousResult.rows.length,
    samples: {
      earlyFeb: formatSample(earlyFebResult.rows),
      lateFeb: formatSample(lateFebResult.rows),
      runWindow: formatSample(runSampleResult.rows),
    },
  });
}
