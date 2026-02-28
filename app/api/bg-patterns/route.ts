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
import type { RunBGContext } from "@/lib/runBGContext";
import { format } from "date-fns";

interface RequestBody {
  events: CalendarEvent[];
  bgContexts: Record<string, RunBGContext>;
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
  const { events, bgContexts } = body;

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
