import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { getUserSettings } from "@/lib/settings";
import { fetchBGFromNS } from "@/lib/nightscout";
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

  const settings = await getUserSettings(email);
  if (!settings.diabetesMode) {
    return NextResponse.json({ readings: [], trend: null });
  }

  const creds = await getUserCredentials(email);
  if (!creds?.nightscoutUrl || !creds.nightscoutSecret) {
    return NextResponse.json({ readings: [], trend: null });
  }

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const readings = await fetchBGFromNS(creds.nightscoutUrl, creds.nightscoutSecret, {
    since,
    count: 500,
  });

  if (readings.length === 0) {
    return NextResponse.json({ readings: [], trend: null });
  }

  // NS returns readings sorted ts DESC (newest first).
  // computeTrend and the client expect ts ASC (oldest first).
  readings.sort((a, b) => a.ts - b.ts);

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
