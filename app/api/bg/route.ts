import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getBGReadings } from "@/lib/bgDb";
import { computeTrend, trendArrow, slopeToArrow } from "@/lib/cgm";
import { NextResponse } from "next/server";

export async function GET() {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const readings = await getBGReadings(email);
  if (readings.length === 0) {
    return NextResponse.json({ readings: [], trend: null });
  }

  const trend = computeTrend(readings);
  const latest = readings[readings.length - 1];

  // Prefer computed trend direction over stored per-reading direction
  const currentDirection = trend?.direction ?? latest.direction;

  return NextResponse.json({
    readings,
    current: {
      mmol: latest.mmol,
      sgv: latest.sgv,
      ts: latest.ts,
      direction: currentDirection,
      arrow: trendArrow(currentDirection),
    },
    trend: trend
      ? {
          slope: trend.slope,
          direction: trend.direction,
          arrow: slopeToArrow(trend.slope),
        }
      : null,
  });
}
