import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

interface CacheRow {
  activity_id: string;
  activity_date: string;
  glucose: string;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = session.user.email;

  // Get all cached activities with glucose data
  const cacheResult = await db().execute({
    sql: `SELECT activity_id, activity_date, glucose
          FROM activity_streams
          WHERE email = ? AND glucose != '[]'
          ORDER BY activity_date DESC`,
    args: [email],
  });

  const cachedRuns = cacheResult.rows as unknown as CacheRow[];

  const results: {
    date: string;
    activityId: string;
    streamPoints: number;
    xdripReadings: number;
    hasXdrip: boolean;
  }[] = [];

  for (const run of cachedRuns) {
    const glucose = JSON.parse(run.glucose) as { time: number; value: number }[];
    if (glucose.length === 0) continue;

    const dateStr = run.activity_date;
    const dayStart = new Date(dateStr + "T00:00:00Z").getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const xdripResult = await db().execute({
      sql: `SELECT COUNT(*) as cnt FROM xdrip_readings
            WHERE email = ? AND ts >= ? AND ts < ?`,
      args: [email, dayStart, dayEnd],
    });

    const xdripCount = (xdripResult.rows[0] as unknown as { cnt: number }).cnt;

    results.push({
      date: dateStr,
      activityId: run.activity_id,
      streamPoints: glucose.length,
      xdripReadings: xdripCount,
      hasXdrip: xdripCount > 0,
    });
  }

  const withXdrip = results.filter((r) => r.hasXdrip).length;
  const withoutXdrip = results.filter((r) => !r.hasXdrip).length;

  return NextResponse.json({
    total: results.length,
    withXdrip,
    withoutXdrip,
    coverage: results.length > 0 ? Math.round((withXdrip / results.length) * 100) : 0,
    runs: results,
  });
}
