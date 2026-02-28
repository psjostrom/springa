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
import { NextResponse } from "next/server";
import type { CalendarEvent } from "@/lib/types";
import { buildRunBGContexts } from "@/lib/runBGContext";
import { getXdripReadings, monthKey } from "@/lib/xdripDb";
import { format } from "date-fns";

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

  // Compute fitness data from events
  const fitnessData = computeFitnessData(events, 180);

  // Fetch wellness data from Intervals.icu
  const completedDates = events
    .filter((e) => e.type === "completed")
    .map((e) => format(e.date, "yyyy-MM-dd"));

  let wellness: Awaited<ReturnType<typeof fetchWellnessData>> = [];
  if (settings.intervalsApiKey && completedDates.length > 0) {
    const oldest = completedDates.reduce((a, b) => (a < b ? a : b));
    const newest = completedDates.reduce((a, b) => (a > b ? a : b));
    wellness = await fetchWellnessData(settings.intervalsApiKey, oldest, newest);
  }

  // Fetch xDrip readings server-side for the full date range of completed runs
  const completedEvents = events.filter((e) => e.type === "completed");
  const timestamps = completedEvents.map((e) => e.date.getTime());
  const durations = completedEvents.map((e) => (e.duration ?? 0) * 1000);

  // Need readings from 1h before earliest run to 2h after latest run end
  const earliestMs = Math.min(...timestamps) - 60 * 60 * 1000;
  const latestMs = Math.max(...timestamps.map((t, i) => t + durations[i])) + 2 * 60 * 60 * 1000;

  // Compute which months we need
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

  const xdripReadings = await getXdripReadings(session.user.email, [...neededMonths]);

  // Debug: xDrip coverage
  console.log(`[bg-patterns] xDrip: ${xdripReadings.length} readings, months=${[...neededMonths].join(",")}`);
  if (xdripReadings.length > 0) {
    console.log(`[bg-patterns] xDrip range: ${new Date(xdripReadings[0].ts).toISOString()} → ${new Date(xdripReadings[xdripReadings.length - 1].ts).toISOString()}`);
  }

  // Build RunBGContexts from the full xDrip dataset
  const bgContextMap = buildRunBGContexts(completedEvents, xdripReadings);
  const bgContexts: Record<string, import("@/lib/runBGContext").RunBGContext> = {};
  for (const [key, value] of bgContextMap) {
    bgContexts[key] = value;
  }

  // Debug: per-run context with dates
  for (const e of completedEvents) {
    const ctx = e.activityId ? bgContexts[e.activityId] : undefined;
    const dateStr = e.date.toISOString().slice(0, 16);
    const preInfo = ctx?.pre ? `slope=${ctx.pre.entrySlope30m.toFixed(2)}, readings=${ctx.pre.readingCount}` : "null";
    // Count xDrip readings in the 30-min window before this run
    const runStartMs = e.date.getTime();
    const preWindowReadings = xdripReadings.filter((r) => r.ts >= runStartMs - 30 * 60 * 1000 && r.ts < runStartMs);
    console.log(`[bg-patterns] ${e.activityId} ${dateStr}: pre=${preInfo}, xdrip30m=${preWindowReadings.length}`);
  }

  // Build enriched run table
  const enrichedRuns = buildEnrichedRunTable(
    events,
    fitnessData,
    wellness,
    bgContexts,
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

    return NextResponse.json({ patterns: result.text });
  } catch (err) {
    const { message, status } = formatAIError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
