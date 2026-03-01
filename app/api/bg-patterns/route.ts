import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { auth } from "@/lib/auth";
import { getUserSettings } from "@/lib/settings";
import { fetchWellnessData } from "@/lib/intervalsApi";
import { computeFitnessData } from "@/lib/fitness";
import {
  buildEnrichedRunTable,
  formatRunTable,
  buildBGPatternPrompt,
} from "@/lib/bgPatterns";
import { formatAIError } from "@/lib/aiError";
import { signIn as mylifeSignIn, fetchMyLifeData, clearSession as clearMyLifeSession } from "@/lib/mylife";
import { buildInsulinContext, type InsulinContext } from "@/lib/insulinContext";
import { NextResponse } from "next/server";
import type { CalendarEvent } from "@/lib/types";
import { buildRunBGContexts } from "@/lib/runBGContext";
import { getXdripReadings, monthKey } from "@/lib/xdripDb";
import { format } from "date-fns";
import { getBGPatterns, saveBGPatterns } from "@/lib/bgPatternsDb";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const saved = await getBGPatterns(session.user.email);
  if (!saved) {
    return NextResponse.json({ patterns: null });
  }

  return NextResponse.json({
    patterns: saved.patternsText,
    latestActivityId: saved.latestActivityId,
    analyzedAt: saved.analyzedAt,
  });
}

interface RequestBody {
  events: CalendarEvent[];
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured." },
      { status: 500 },
    );
  }

  const body = (await req.json()) as RequestBody;
  const { events } = body;

  if (events.length === 0) {
    return NextResponse.json(
      { error: "No events provided" },
      { status: 400 },
    );
  }

  // Restore Date objects (JSON serialization turns them into strings)
  for (const e of events) {
    e.date = new Date(e.date);
  }

  const settings = await getUserSettings(session.user.email);
  const { mylifeEmail, mylifePassword } = settings;
  const mylifeTz = settings.timezone ?? "Europe/Stockholm";

  // Compute fitness data from events
  const fitnessData = computeFitnessData(events, 180);

  // Identify completed runs (needed by wellness, xDrip, and MyLife)
  const completedEvents = events.filter((e) => e.type === "completed");
  if (completedEvents.length === 0) {
    return NextResponse.json(
      { error: "No completed events provided" },
      { status: 400 },
    );
  }

  const completedDates = completedEvents.map((e) => format(e.date, "yyyy-MM-dd"));
  const timestamps = completedEvents.map((e) => e.date.getTime());
  const durations = completedEvents.map((e) => (e.duration ?? 0) * 1000);

  // Need readings from 1h before earliest run to 2h after latest run end
  const earliestMs = Math.min(...timestamps) - 60 * 60 * 1000;
  const latestMs = Math.max(...timestamps.map((t, i) => t + durations[i])) + 2 * 60 * 60 * 1000;

  // Compute which months we need for xDrip
  const neededMonths = new Set<string>();
  let cursor = earliestMs;
  while (cursor < latestMs) {
    neededMonths.add(monthKey(cursor));
    // Jump to next month
    const d = new Date(cursor);
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
    cursor = d.getTime();
  }
  neededMonths.add(monthKey(latestMs));

  // Start MyLife fetch in parallel (doesn't depend on wellness or xDrip)
  const mylifeDataP = mylifeEmail && mylifePassword
    ? mylifeSignIn(mylifeEmail, mylifePassword)
        .then((session) => fetchMyLifeData(session, mylifeTz))
        .catch((err: unknown) => {
          console.error("MyLife fetch failed (bg-patterns):", err);
          clearMyLifeSession(mylifeEmail);
          return null;
        })
    : Promise.resolve(null);

  // Fetch wellness and xDrip readings (parallel with MyLife)
  let wellness: Awaited<ReturnType<typeof fetchWellnessData>> = [];
  if (settings.intervalsApiKey && completedDates.length > 0) {
    const oldest = completedDates.reduce((a, b) => (a < b ? a : b));
    const newest = completedDates.reduce((a, b) => (a > b ? a : b));
    wellness = await fetchWellnessData(settings.intervalsApiKey, oldest, newest);
  }

  const xdripReadings = await getXdripReadings(session.user.email, [...neededMonths]);

  // Build RunBGContexts from the full xDrip dataset
  const bgContextMap = buildRunBGContexts(completedEvents, xdripReadings);
  const bgContexts: Record<string, import("@/lib/runBGContext").RunBGContext> = {};
  for (const [key, value] of bgContextMap) {
    bgContexts[key] = value;
  }

  // Build insulin contexts from MyLife data
  const insulinContexts: Record<string, InsulinContext> = {};
  const mylifeData = await mylifeDataP;
  if (mylifeData) {
    for (const event of completedEvents) {
      if (!event.activityId) continue;
      const ctx = buildInsulinContext(mylifeData, event.date.getTime());
      if (ctx) {
        insulinContexts[event.activityId] = ctx;
      }
    }
  }

  // Build enriched run table
  const enrichedRuns = buildEnrichedRunTable(
    events,
    fitnessData,
    wellness,
    bgContexts,
    insulinContexts,
  );

  if (enrichedRuns.length < 5) {
    return NextResponse.json(
      { error: `Need at least 5 runs with BG data for pattern analysis (found ${enrichedRuns.length}).` },
      { status: 400 },
    );
  }

  const table = formatRunTable(enrichedRuns);
  const { system, user } = buildBGPatternPrompt(table, enrichedRuns.length);

  const anthropic = createAnthropic({ apiKey });

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system,
      messages: [{ role: "user", content: user }],
    });

    // Find the most recent completed run with glucose data to track staleness
    const withGlucose = completedEvents
      .filter((e) => e.activityId && e.streamData?.glucose)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    const latestActivityId = withGlucose[0]?.activityId ?? "";

    if (latestActivityId) {
      await saveBGPatterns(session.user.email, latestActivityId, result.text);
    }

    return NextResponse.json({ patterns: result.text, latestActivityId });
  } catch (err) {
    const { message, status } = formatAIError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
