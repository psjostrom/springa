import { after } from "next/server";
import { NextResponse } from "next/server";
import { unauthorized, getMyLifeData } from "@/lib/apiHelpers";
import { validateApiSecretFromDB, getUserCredentials } from "@/lib/credentials";
import { saveTreatments, getTreatments, getLastTreatmentTs } from "@/lib/treatmentsDb";
import { mapMyLifeToTreatments, treatmentToNightscout } from "@/lib/mylifeToNightscout";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/v1/treatments — Nightscout-compatible treatments endpoint.
 *
 * Returns treatment data from the local DB immediately, then triggers a
 * background sync from mylife Cloud if the data is stale (>5 min old).
 *
 * Query params (Nightscout-compatible):
 *   count — max results (default 10, max 10000)
 *   find[created_at][$gte] — ISO 8601 or ms timestamp, lower bound
 *   find[created_at][$lte] — ISO 8601 or ms timestamp, upper bound
 *   find[eventType] — filter by event type
 */
export async function GET(req: Request) {
  const email = await validateApiSecretFromDB(req.headers.get("api-secret"));
  if (!email) return unauthorized();

  // Check staleness and schedule background sync if needed.
  const lastTs = await getLastTreatmentTs(email);
  const isStale = !lastTs || Date.now() - lastTs > SYNC_INTERVAL_MS;
  if (isStale) {
    after(async () => {
      try {
        const creds = await getUserCredentials(email);
        if (creds?.mylifeEmail && creds.mylifePassword) {
          const data = await getMyLifeData(creds.mylifeEmail, creds.mylifePassword, creds.timezone);
          if (data && data.events.length > 0) {
            const treatments = mapMyLifeToTreatments(data.events);
            await saveTreatments(email, treatments);
          }
        }
      } catch (err) {
        console.error("[treatments] background sync failed:", err);
      }
    });
  }

  // Parse query params
  const url = new URL(req.url);
  const count = Math.min(
    Math.max(parseInt(url.searchParams.get("count") ?? "10", 10) || 10, 1),
    10_000,
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

/** Parse a timestamp that could be ISO 8601 or ms epoch. Returns undefined if unparseable. */
function parseTimestamp(raw: string): number | undefined {
  const asNum = Number(raw);
  if (!isNaN(asNum) && asNum > 1e12) return asNum; // ms epoch
  const asDate = new Date(raw).getTime();
  if (!isNaN(asDate)) return asDate;
  return undefined; // invalid input → no filter (not epoch 0)
}
