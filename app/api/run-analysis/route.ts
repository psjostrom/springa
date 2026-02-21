import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { auth } from "@/lib/auth";
import {
  getUserSettings,
  getRunAnalysis,
  saveRunAnalysis,
} from "@/lib/settings";
import { buildRunAnalysisPrompt } from "@/lib/runAnalysisPrompt";
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

  const settings = await getUserSettings(session.user.email);
  const aiKey =
    settings.googleAiApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!aiKey) {
    return NextResponse.json(
      { error: "No Google AI API key configured." },
      { status: 400 },
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

  const { system, user } = buildRunAnalysisPrompt({
    event,
    runBGContext,
    reportCard,
  });

  const google = createGoogleGenerativeAI({ apiKey: aiKey });

  const result = await generateText({
    model: google("gemini-2.0-flash"),
    system,
    messages: [{ role: "user", content: user }],
  });

  const analysis = result.text;

  // Cache the result
  await saveRunAnalysis(session.user.email, activityId, analysis);

  return NextResponse.json({ analysis });
}
