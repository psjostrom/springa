import { NextResponse } from "next/server";
import { format } from "date-fns";
import { getUserSettings } from "@/lib/settings";
import { getPrerunPushUsers, hasPrerunPushSent, markPrerunPushSent } from "@/lib/pushDb";
import { getRecentXdripReadings } from "@/lib/xdripDb";
import { getBGCache } from "@/lib/bgCacheDb";
import { computeTrend } from "@/lib/xdrip";
import { buildBGModelFromCached } from "@/lib/bgModel";
import { getWorkoutCategory } from "@/lib/constants";
import { assessReadiness, formatGuidancePush } from "@/lib/prerun";
import { sendPushToUser } from "@/lib/push";
import { authHeader } from "@/lib/intervalsApi";
import { API_BASE } from "@/lib/constants";
import { nowInTimezone, resolveTimezone } from "@/lib/intervalsHelpers";
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
      const settings = await getUserSettings(email);
      if (!settings.intervalsApiKey) {
        skipped++;
        continue;
      }

      const timezone = await resolveTimezone(
        email,
        settings.timezone,
        settings.intervalsApiKey,
      );
      if (!timezone) {
        skipped++;
        continue;
      }

      // Compute "today" in the user's timezone
      const nowLocal = nowInTimezone(timezone);
      const todayLocal = format(nowLocal, "yyyy-MM-dd");

      // Fetch today's events from Intervals.icu
      const eventsRes = await fetch(
        `${API_BASE}/athlete/0/events?oldest=${todayLocal}&newest=${todayLocal}`,
        { headers: { Authorization: authHeader(settings.intervalsApiKey) } },
      );
      if (!eventsRes.ok) {
        skipped++;
        continue;
      }
      const events: IntervalsEvent[] = await eventsRes.json();

      // Filter for WORKOUT events starting 1.5–2.5h from now (in user's timezone)
      const upcoming = events.filter((e) => {
        if (e.category !== "WORKOUT") return false;
        const eventLocal = new Date(e.start_date_local);
        const diffMs = eventLocal.getTime() - nowLocal.getTime();
        return diffMs >= WINDOW_MIN_MS && diffMs <= WINDOW_MAX_MS;
      });

      for (const event of upcoming) {
        const eventDateStr = event.start_date_local.slice(0, 10);
        if (await hasPrerunPushSent(email, eventDateStr)) {
          skipped++;
          continue;
        }

        // Fetch only the last 30 minutes of readings
        const readings = await getRecentXdripReadings(email);
        if (readings.length === 0) {
          skipped++;
          continue;
        }

        // Skip if latest reading is stale (>15 min old)
        const lastReading = readings[readings.length - 1];
        if (now - lastReading.ts > STALE_THRESHOLD_MS) {
          skipped++;
          continue;
        }

        const trendResult = computeTrend(readings);
        const trendSlope = trendResult?.slope ?? null;
        const cached = await getBGCache(email);
        const bgModel = buildBGModelFromCached(cached);
        const currentBG = lastReading.mmol;
        const rawCategory = getWorkoutCategory(event.name ?? "");
        const category = rawCategory === "other" ? "easy" : rawCategory;

        const guidance = assessReadiness({
          currentBG,
          trendSlope,
          bgModel,
          category,
        });

        const { title, body } = formatGuidancePush(guidance, currentBG);
        const eventId = `event-${event.id}`;
        await sendPushToUser(email, { title, body, url: `/?tab=calendar&workout=${eventId}` });
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
