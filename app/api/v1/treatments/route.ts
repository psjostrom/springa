import { after } from "next/server";
import { NextResponse } from "next/server";
import { unauthorized, getMyLifeData } from "@/lib/apiHelpers";
import { validateApiSecretFromDB, getUserCredentials } from "@/lib/credentials";
import { saveTreatments, getTreatments, getTreatmentsSyncedAt, setTreatmentsSyncedAt, getTreatmentIds } from "@/lib/treatmentsDb";
import { mapMyLifeToTreatments, treatmentToNightscout } from "@/lib/mylifeToNightscout";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/v1/treatments — Nightscout-compatible treatments endpoint.
 *
 * Returns treatment data from the local DB immediately, then triggers a
 * background sync from mylife Cloud if the last sync was >5 min ago.
 * Uses treatments_synced_at (not treatment data age) to prevent redundant
 * scrapes — mylife data updates ~every 2h, so most syncs find nothing new.
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

  // Check when we last successfully synced from mylife (not when data was last written).
  // Timestamp is only set after a successful scrape, so failed syncs retry immediately.
  const syncedAt = await getTreatmentsSyncedAt(email);
  const needsSync = !syncedAt || Date.now() - syncedAt > SYNC_INTERVAL_MS;
  if (needsSync) {
    after(async () => {
      try {
        const creds = await getUserCredentials(email);
        if (creds?.mylifeEmail && creds.mylifePassword) {
          const data = await getMyLifeData(creds.mylifeEmail, creds.mylifePassword, creds.timezone);
          if (data && data.events.length > 0) {
            const treatments = mapMyLifeToTreatments(data.events);
            // Short-circuit: skip DB writes if all treatment IDs already exist.
            // mylife data is append-only — existing IDs are never updated.
            const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — covers mylife logbook window
            const existingIds = await getTreatmentIds(email, Date.now() - LOOKBACK_MS);
            const newTreatments = treatments.filter((t) => !existingIds.has(t.id));
            if (newTreatments.length > 0) {
              await saveTreatments(email, newTreatments);
            }
          }
          // Only mark sync complete on success — failed syncs retry on next request
          await setTreatmentsSyncedAt(email, Date.now());
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
