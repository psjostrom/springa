import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { buildBGPatternPrompt } from "@/lib/bgPatterns";
import { formatAIError } from "@/lib/aiError";
import { NextResponse } from "next/server";
import type { CalendarEvent } from "@/lib/types";
import { getBGPatterns, saveBGPatterns } from "@/lib/bgPatternsDb";
import { buildBGPatternContext } from "@/lib/bgPatternContext";

export async function GET() {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const saved = await getBGPatterns(email);
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
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
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

  const context = await buildBGPatternContext({ email, events });

  if (context.enrichedRuns.length < 5) {
    return NextResponse.json(
      { error: `Need at least 5 runs with BG data for pattern analysis (found ${context.enrichedRuns.length}).` },
      { status: 400 },
    );
  }

  const { system, user } = buildBGPatternPrompt(context.table, context.runCount);

  const anthropic = createAnthropic({ apiKey });

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system,
      messages: [{ role: "user", content: user }],
    });

    if (context.latestActivityId) {
      await saveBGPatterns(email, context.latestActivityId, result.text);
    }

    return NextResponse.json({ patterns: result.text, latestActivityId: context.latestActivityId });
  } catch (err) {
    const { message, status } = formatAIError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
