import { NextResponse } from "next/server";
import { getPrerunPushUsers, hasPrerunPushSent, markPrerunPushSent } from "@/lib/pushDb";
import { getRecentXdripReadings } from "@/lib/xdripDb";
import { getActivityStreams } from "@/lib/activityStreamsDb";
import { buildEventGuidance } from "@/lib/prerunGuidance";
import { sendPushToUser } from "@/lib/push";
import { authHeader, fetchWellnessData } from "@/lib/intervalsApi";
import { API_BASE } from "@/lib/constants";
import { todayInTimezone, localToUtcMs, resolveTimezone } from "@/lib/intervalsHelpers";
import { wellnessToFitnessData } from "@/lib/fitness";
import { getMyLifeData } from "@/lib/apiHelpers";
import { buildInsulinContext } from "@/lib/insulinContext";
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

  const apiKey = process.env.INTERVALS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured" }, { status: 500 });
  }

  const timezone = resolveTimezone();

  // Fetch TSB and IOB once — shared across all users/events
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
    console.error("[prerun-push] Failed to fetch wellness/TSB:", err);
  }

  let currentIob: number | null = null;
  try {
    const data = await getMyLifeData();
    if (data) {
      const ctx = buildInsulinContext(data, now);
      currentIob = ctx?.actionableIOB ?? null;
    }
  } catch (err) {
    console.error("[prerun-push] Failed to fetch MyLife/IOB:", err);
  }

  for (const email of emails) {
    try {
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

      for (const event of upcoming) {
        const eventDateStr = event.start_date_local.slice(0, 10);
        if (await hasPrerunPushSent(email, eventDateStr)) {
          skipped++;
          continue;
        }

        const readings = await getRecentXdripReadings(email);
        const cached = await getActivityStreams(email);

        const result = await buildEventGuidance({
          event,
          email,
          readings,
          cached,
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
