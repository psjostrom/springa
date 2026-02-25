import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { auth } from "@/lib/auth";
import { applyAdaptations, assembleDescription } from "@/lib/adaptPlan";
import { buildAdaptNotePrompt } from "@/lib/adaptPlanPrompt";
import { getRecentFeedback } from "@/lib/feedbackDb";
import { formatAIError } from "@/lib/aiError";
import { NextResponse } from "next/server";
import type { CalendarEvent } from "@/lib/types";
import type { BGResponseModel } from "@/lib/bgModel";
import type { FitnessInsights } from "@/lib/fitness";
import type { RunBGContext } from "@/lib/runBGContext";
import type { AdaptedEvent } from "@/lib/adaptPlan";

interface RequestBody {
  upcomingEvents: CalendarEvent[];
  recentCompleted: CalendarEvent[];
  bgModel: BGResponseModel;
  insights: FitnessInsights;
  runBGContexts: Record<string, RunBGContext>;
  prefix: string;
  lthr: number;
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

  const recentFeedback = await getRecentFeedback(session.user.email);

  const body = (await req.json()) as RequestBody;
  const {
    upcomingEvents,
    recentCompleted,
    bgModel,
    insights,
    runBGContexts,
    prefix,
    lthr,
  } = body;

  // Restore Date objects from JSON serialization
  for (const e of upcomingEvents) {
    e.date = new Date(e.date);
  }
  for (const e of recentCompleted) {
    e.date = new Date(e.date);
  }

  // 1. Apply rule-based adaptations (fuel + swap)
  const adapted = applyAdaptations({
    upcomingEvents,
    bgModel,
    insights,
    runBGContexts,
    prefix,
  });

  // 2. Generate AI notes in parallel (max 4)
  const anthropic = createAnthropic({ apiKey });

  try {
    const withNotes = await Promise.all(
      adapted.map(async (event): Promise<AdaptedEvent> => {
        // Find recent completed runs of the same category
        const cat = event.category;
        const recentSameCategory = recentCompleted.filter(
          (r) =>
            r.type === "completed" &&
            r.category === cat,
        );

        const { system, user } = buildAdaptNotePrompt({
          adapted: event,
          recentSameCategory,
          bgModel,
          insights,
          runBGContexts,
          lthr,
          recentFeedback,
        });

        try {
          const result = await generateText({
            model: anthropic("claude-sonnet-4-6"),
            system,
            messages: [{ role: "user", content: user }],
          });

          const aiNotes = result.text;
          const description = assembleDescription(
            aiNotes,
            event.structure,
            event.fuelRate,
            event.original.duration,
          );

          return { ...event, notes: aiNotes, description };
        } catch {
          // Fall back to change summary if AI fails
          const fallbackNotes = event.changes.length > 0
            ? event.changes.map((c) => c.detail).join(". ") + "."
            : "No changes.";
          const description = assembleDescription(
            fallbackNotes,
            event.structure,
            event.fuelRate,
            event.original.duration,
          );
          return { ...event, notes: fallbackNotes, description };
        }
      }),
    );

    return NextResponse.json({ adaptedEvents: withNotes });
  } catch (err) {
    const { message, status } = formatAIError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
