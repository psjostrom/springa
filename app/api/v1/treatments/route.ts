import { NextResponse } from "next/server";
import { validateApiSecret, unauthorized, getMyLifeData } from "@/lib/apiHelpers";
import { db } from "@/lib/db";
import { saveTreatments, getTreatments } from "@/lib/treatmentsDb";
import { mapMyLifeToTreatments, treatmentToNightscout } from "@/lib/mylifeToNightscout";

/** In-memory tracker for last sync time per email. */
const lastSyncTime = new Map<string, number>();
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/v1/treatments — Nightscout-compatible treatments endpoint.
 *
 * Lazy sync: if last mylife sync was >5 min ago, fetches fresh data
 * from mylife Cloud, converts to NS format, upserts to DB, then serves.
 *
 * Query params (Nightscout-compatible):
 *   count — max results (default 10, max 500)
 *   find[created_at][$gte] — ISO 8601 or ms timestamp, lower bound
 *   find[created_at][$lte] — ISO 8601 or ms timestamp, upper bound
 *   find[eventType] — filter by event type
 */
export async function GET(req: Request) {
  if (!validateApiSecret(req.headers.get("api-secret"))) {
    return unauthorized();
  }

  // Get the single user's email
  const result = await db().execute({
    sql: "SELECT email FROM user_settings LIMIT 1",
    args: [],
  });
  const email = result.rows[0]?.email as string;
  if (!email) {
    return NextResponse.json([], { status: 200 });
  }

  // Lazy sync: fetch from mylife Cloud if stale
  const lastSync = lastSyncTime.get(email) ?? 0;
  if (Date.now() - lastSync > SYNC_INTERVAL_MS) {
    try {
      const data = await getMyLifeData();
      if (data && data.events.length > 0) {
        const treatments = mapMyLifeToTreatments(data.events);
        await saveTreatments(email, treatments);
      }
      lastSyncTime.set(email, Date.now());
    } catch (err) {
      console.error("[treatments] mylife sync failed:", err);
      // Serve stale data rather than failing
    }
  }

  // Parse query params
  const url = new URL(req.url);
  const count = Math.min(
    Math.max(parseInt(url.searchParams.get("count") ?? "10", 10) || 10, 1),
    500,
  );

  const gteRaw = url.searchParams.get("find[created_at][$gte]");
  const lteRaw = url.searchParams.get("find[created_at][$lte]");
  const eventType = url.searchParams.get("find[eventType]") ?? undefined;

  const since = gteRaw ? parseTimestamp(gteRaw) : undefined;
  const until = lteRaw ? parseTimestamp(lteRaw) : undefined;

  const treatments = await getTreatments(email, { since, until, eventType, count });

  const response = treatments.map(treatmentToNightscout);
  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-cache, no-store" },
  });
}

/** Parse a timestamp that could be ISO 8601 or ms epoch. */
function parseTimestamp(raw: string): number {
  const asNum = Number(raw);
  if (!isNaN(asNum) && asNum > 1e12) return asNum; // ms epoch
  const asDate = new Date(raw).getTime();
  if (!isNaN(asDate)) return asDate;
  return 0;
}
