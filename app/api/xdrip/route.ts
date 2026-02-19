import { auth } from "@/lib/auth";
import { getXdripReadings } from "@/lib/settings";
import { computeTrend, trendArrow } from "@/lib/xdrip";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readings = await getXdripReadings(session.user.email);
  if (readings.length === 0) {
    return NextResponse.json({ readings: [], trend: null });
  }

  const trend = computeTrend(readings);
  const latest = readings[readings.length - 1];

  return NextResponse.json({
    readings,
    current: {
      mmol: latest.mmol,
      sgv: latest.sgv,
      ts: latest.ts,
      direction: latest.direction,
      arrow: trendArrow(trend?.direction ?? latest.direction),
    },
    trend: trend
      ? {
          slope: trend.slope,
          direction: trend.direction,
          arrow: trendArrow(trend.direction),
        }
      : null,
  });
}
