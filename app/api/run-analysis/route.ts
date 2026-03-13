import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getRunAnalysis, saveRunAnalysis } from "@/lib/runAnalysisDb";
import { buildRunAnalysisPrompt } from "@/lib/runAnalysisPrompt";
import { buildRunAnalysisContext } from "@/lib/runAnalysisContext";
import { formatAIError } from "@/lib/aiError";
import { NextResponse } from "next/server";
import type { CalendarEvent } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import type { ReportCard } from "@/lib/reportCard";

interface RequestBody {
  activityId: string;
  event: CalendarEvent;
  runBGContext?: RunBGContext | null;
  reportCard?: ReportCard | null;
  bgModelSummary?: string;
  regenerate?: boolean;
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

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid or empty request body" },
      { status: 400 },
    );
  }

  const { activityId, event, runBGContext, reportCard, bgModelSummary, regenerate } = body;

  if (!activityId) {
    return NextResponse.json(
      { error: "activityId is required" },
      { status: 400 },
    );
  }

  // Restore Date object (JSON serialization turns it into a string)
  event.date = new Date(event.date);

  // Check cache unless regenerating
  if (!regenerate) {
    const cached = await getRunAnalysis(email, activityId);
    if (cached) {
      return NextResponse.json({ analysis: cached });
    }
  }

  const promptParams = await buildRunAnalysisContext({
    email,
    event,
    runStartMs: event.date.getTime(),
    runBGContext,
    reportCard,
    bgModelSummary,
  });

  const { system, user } = buildRunAnalysisPrompt(promptParams);

  const anthropic = createAnthropic({ apiKey });

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system,
      messages: [{ role: "user", content: user }],
    });

    const analysis = result.text;

    // Cache the result
    await saveRunAnalysis(email, activityId, analysis);

    return NextResponse.json({ analysis });
  } catch (err) {
    const { message, status } = formatAIError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
