import { NextResponse } from "next/server";
import { getPrerunPushUsers, hasPrerunPushSent, markPrerunPushSent } from "@/lib/pushDb";
import { getActivityStreams } from "@/lib/activityStreamsDb";
import { enrichActivitiesWithGlucose } from "@/lib/activityStreamsEnrich";
import { buildBGModelFromCached } from "@/lib/bgModel";
import { buildEventGuidance } from "@/lib/prerunGuidance";
import { sendPushToUser } from "@/lib/push";
import { authHeader, fetchWellnessData } from "@/lib/intervalsApi";
import { API_BASE } from "@/lib/constants";
import { todayInTimezone, localToUtcMs, resolveTimezone } from "@/lib/intervalsHelpers";
import { wellnessToFitnessData } from "@/lib/fitness";
import { getUserCredentials } from "@/lib/credentials";
import { fetchBGFromNS } from "@/lib/nightscout";
import { fetchIOB, tauForInsulin } from "@/lib/iob";
import { getUserSettings } from "@/lib/settings";
import type { IntervalsEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_THRESHOLD_MS = 15 * 60 * 1000;
const WINDOW_MIN_MS = 1.5 * 60 * 60 * 1000;
const WINDOW_MAX_MS = 2.5 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const authValue = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authValue !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const emails = await getPrerunPushUsers();
  let sent = 0;
  let skipped = 0;

  for (const email of emails) {
    try {
      const creds = await getUserCredentials(email);
      if (!creds?.intervalsApiKey) {
        skipped++;
        continue;
      }
      const apiKey = creds.intervalsApiKey;
      const timezone = resolveTimezone(creds.timezone);

      // Per-user TSB
      const today = new Date();
      const oldest = new Date(today);
      oldest.setDate(oldest.getDate() - 42);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      let currentTsb: number | null = null;
      try {
        const wellness = await fetchWellnessData(apiKey, fmt(oldest), fmt(today));
        const fitness = wellnessToFitnessData(wellness);
        currentTsb = fitness.length > 0 ? fitness[fitness.length - 1].tsb : null;
      } catch (err) {
        console.error(`[prerun-push] Failed to fetch wellness/TSB for ${email}:`, err);
      }

      // Check sugar mode — skip BG readiness checks when off
      const settings = await getUserSettings(email);

      let currentIob: number | null = null;
      if (creds.nightscoutUrl && creds.nightscoutSecret) {
        try {
          const tau = tauForInsulin(settings.insulinType);
          const iob = await fetchIOB(creds.nightscoutUrl, creds.nightscoutSecret, tau);
          currentIob = iob > 0 ? iob : null;
        } catch (err) {
          console.error(`[prerun-push] Failed to compute IOB for ${email}:`, err);
        }
      }

      // Compute "today" in the user's timezone (DST-safe)
      const todayLocal = todayInTimezone(timezone);

      // Fetch today's events from Intervals.icu
      const eventsRes = await fetch(
        `${API_BASE}/athlete/0/events?oldest=${todayLocal}&newest=${todayLocal}`,
        { headers: { Authorization: authHeader(apiKey) } },
      );
      if (!eventsRes.ok) {
        skipped++;
        continue;
      }
      const events = (await eventsRes.json()) as IntervalsEvent[];

      // Filter for WORKOUT events starting 1.5–2.5h from now (DST-safe UTC math)
      const upcoming = events.filter((e) => {
        if (e.category !== "WORKOUT") return false;
        const eventUtcMs = localToUtcMs(e.start_date_local, timezone);
        const diffMs = eventUtcMs - now;
        return diffMs >= WINDOW_MIN_MS && diffMs <= WINDOW_MAX_MS;
      });

      let readings: Awaited<ReturnType<typeof fetchBGFromNS>> = [];
      let bgModel: ReturnType<typeof buildBGModelFromCached> | null = null;

      if (settings.diabetesMode) {
        // Fetch readings from Nightscout — on failure, fall through with empty readings
        // so non-BG parts (TSB, timing) still work
        if (creds.nightscoutUrl && creds.nightscoutSecret) {
          try {
            readings = await fetchBGFromNS(creds.nightscoutUrl, creds.nightscoutSecret, {
              since: now - 30 * 60 * 1000, // last 30 min
              count: 20,
            });
          } catch (err) {
            console.warn(`[prerun-push] Failed to fetch BG from Nightscout for ${email}:`, err);
          }
        }

        const cached = await getActivityStreams(email);
        const enriched = await enrichActivitiesWithGlucose(email, cached);
        bgModel = buildBGModelFromCached(enriched);
      }

      for (const event of upcoming) {
        const eventDateStr = event.start_date_local.slice(0, 10);
        if (await hasPrerunPushSent(email, eventDateStr)) {
          skipped++;
          continue;
        }

        const result = buildEventGuidance({
          event,
          readings,
          bgModel,
          currentTsb,
          currentIob,
          now,
          staleThresholdMs: STALE_THRESHOLD_MS,
        });

        if (!result) {
          skipped++;
          continue;
        }

        await sendPushToUser(email, {
          title: result.title,
          body: result.body,
          url: `/?tab=calendar&workout=${result.eventId}`,
        });
        await markPrerunPushSent(email, eventDateStr);
        sent++;
      }
    } catch (err) {
      console.error(`prerun-push failed for ${email}:`, err);
      skipped++;
    }
  }

  return NextResponse.json({ sent, skipped, users: emails.length });
}
