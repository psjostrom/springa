import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { auth } from "@/lib/auth";
import {
  getRunAnalysis,
  saveRunAnalysis,
  getRecentRunHistory,
} from "@/lib/runAnalysisDb";
import { getRunFeedbackByActivity, getRecentFeedback } from "@/lib/feedbackDb";
import { buildRunAnalysisPrompt } from "@/lib/runAnalysisPrompt";
import { getUserSettings } from "@/lib/settings";
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
  regenerate?: boolean;
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
  const { activityId, event, runBGContext, reportCard, regenerate } = body;

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
    const cached = await getRunAnalysis(session.user.email, activityId);
    if (cached) {
      return NextResponse.json({ analysis: cached });
    }
  }

  const [history, feedback, recentFeedback, settings] = await Promise.all([
    getRecentRunHistory(session.user.email),
    getRunFeedbackByActivity(session.user.email, activityId),
    getRecentFeedback(session.user.email),
    getUserSettings(session.user.email),
  ]);

  const historyFeedbackMap = new Map(
    recentFeedback.filter((fb) => fb.activityId).map((fb) => [fb.activityId!, fb]),
  );

  const { system, user } = buildRunAnalysisPrompt({
    event,
    runBGContext,
    reportCard,
    history,
    historyFeedback: historyFeedbackMap,
    athleteFeedback: feedback ? { rating: feedback.rating, comment: feedback.comment, carbsG: feedback.carbsG } : undefined,
    lthr: settings.lthr,
    maxHr: settings.maxHr,
    hrZones: settings.hrZones,
  });

  const anthropic = createAnthropic({ apiKey });

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system,
      messages: [{ role: "user", content: user }],
    });

    const analysis = result.text;

    // Cache the result
    await saveRunAnalysis(session.user.email, activityId, analysis);

    return NextResponse.json({ analysis });
  } catch (err) {
    const { message, status } = formatAIError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
