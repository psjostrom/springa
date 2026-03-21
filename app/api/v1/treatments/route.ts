import { after } from "next/server";
import { NextResponse } from "next/server";
import { validateRequest, unauthorized, getEmail, getMyLifeData } from "@/lib/apiHelpers";
import { saveTreatments, getTreatments, getLastTreatmentTs } from "@/lib/treatmentsDb";
import { mapMyLifeToTreatments, treatmentToNightscout } from "@/lib/mylifeToNightscout";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/v1/treatments — Nightscout-compatible treatments endpoint.
 *
 * Returns treatment data from the local DB immediately, then triggers a
 * background sync from mylife Cloud if the data is stale (>5 min old).
 *
 * ## Architecture: stale-while-revalidate (and why)
 *
 * The proper architecture would be strict read/write separation:
 *   - GET reads from DB (pure, fast, cacheable)
 *   - A cron job syncs mylife Cloud → DB on a fixed interval (e.g. every 10 min)
 *
 * We can't do that because:
 *   1. Vercel free tier limits cron jobs to 1/day
 *   2. mylife Cloud is a legacy ASPX portal that requires login + scraping,
 *      taking 2-5 seconds per sync — too slow to block a GET response
 *   3. An external cron (e.g. GitHub Actions) adds infrastructure to maintain
 *
 * Instead, we use a stale-while-revalidate pattern:
 *   - GET always returns from DB immediately (fast response)
 *   - If data is stale, after() fires a non-blocking background sync
 *   - The NEXT request sees fresh data
 *   - First request after staleness gets slightly old data (acceptable for
 *     treatment history — insulin/carb events from minutes to hours ago)
 *
 * This works in practice because Strimma's TreatmentSyncer polls every 5
 * minutes as a foreground service, so there is always a consistent reader
 * keeping the DB warm. If Strimma stops polling (phone off, app killed),
 * data goes stale until the next request triggers a background sync.
 *
 * ## Known limitations
 *
 * - Staleness is measured by getLastTreatmentTs() (newest treatment in DB),
 *   not "when we last synced." If mylife Cloud has no new events, the
 *   timestamp never advances and every request triggers a background sync.
 *   For a single user this is harmless (one extra scrape per 5-min poll).
 *   For multi-user, add a last_synced_at column per user.
 *
 * - No deduplication of concurrent syncs. If two requests arrive while
 *   stale, both fire background syncs. The DB upsert (INSERT OR REPLACE)
 *   makes this safe but wasteful. For multi-user, add a sync lock.
 *
 * ## If upgrading to Vercel Pro or adding external cron
 *
 * 1. Create POST /api/v1/treatments/sync (move syncTreatments() there)
 * 2. Add cron job hitting that endpoint every 10-15 min
 * 3. Remove the after() block below — GET becomes a pure read
 * 4. Add last_synced_at column to avoid redundant syncs
 *
 * Query params (Nightscout-compatible):
 *   count — max results (default 10, max 500)
 *   find[created_at][$gte] — ISO 8601 or ms timestamp, lower bound
 *   find[created_at][$lte] — ISO 8601 or ms timestamp, upper bound
 *   find[eventType] — filter by event type
 */
export async function GET(req: Request) {
  if (!validateRequest(req)) {
    return unauthorized();
  }

  const email = await getEmail();
  if (!email) {
    return NextResponse.json([], { status: 200 });
  }

  // Check staleness and schedule background sync if needed.
  // after() runs AFTER the response is sent — the client never waits for
  // the mylife Cloud scrape (2-5 seconds).
  const lastTs = await getLastTreatmentTs(email);
  const isStale = !lastTs || Date.now() - lastTs > SYNC_INTERVAL_MS;
  if (isStale) {
    after(async () => {
      try {
        const data = await getMyLifeData();
        if (data && data.events.length > 0) {
          const treatments = mapMyLifeToTreatments(data.events);
          await saveTreatments(email, treatments);
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

/** Parse a timestamp that could be ISO 8601 or ms epoch. Returns undefined if unparseable. */
function parseTimestamp(raw: string): number | undefined {
  const asNum = Number(raw);
  if (!isNaN(asNum) && asNum > 1e12) return asNum; // ms epoch
  const asDate = new Date(raw).getTime();
  if (!isNaN(asDate)) return asDate;
  return undefined; // invalid input → no filter (not epoch 0)
}
