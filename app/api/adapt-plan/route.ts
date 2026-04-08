import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { applyAdaptations, assembleDescription } from "@/lib/adaptPlan";
import { buildAdaptNotePrompt } from "@/lib/adaptPlanPrompt";
import { formatAIError } from "@/lib/aiError";
import { NextResponse } from "next/server";
import type { CalendarEvent, PaceTable } from "@/lib/types";
import type { BGResponseModel } from "@/lib/bgModel";
import type { FitnessInsights } from "@/lib/fitness";
import type { RunBGContext } from "@/lib/runBGContext";
import type { AdaptedEvent } from "@/lib/adaptPlan";
import { getBGPatterns } from "@/lib/bgPatternsDb";
import { getUserSettings } from "@/lib/settings";

interface RequestBody {
  upcomingEvents: CalendarEvent[];
  recentCompleted: CalendarEvent[];
  bgModel: BGResponseModel;
  insights: FitnessInsights;
  runBGContexts: Record<string, RunBGContext>;
  lthr: number;
  maxHr?: number;
  hrZones: number[];
  paceTable?: PaceTable;
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
  const {
    upcomingEvents,
    recentCompleted,
    bgModel,
    insights,
    runBGContexts,
    lthr,
    maxHr,
    hrZones,
    paceTable,
  } = body;

  // Restore Date objects from JSON serialization
  for (const e of upcomingEvents) {
    e.date = new Date(e.date);
  }
  for (const e of recentCompleted) {
    e.date = new Date(e.date);
  }

  // Check sugar mode — skip fuel adaptations when off
  const settings = await getUserSettings(email);

  const patterns = settings.diabetesMode ? await getBGPatterns(email) : null;

  // Build feedback map from CalendarEvent custom fields
  const feedbackByActivity = new Map<string, { rating?: string; comment?: string; carbsG?: number; createdAt: number }>();
  for (const e of recentCompleted) {
    if (e.activityId && (e.rating || e.feedbackComment)) {
      feedbackByActivity.set(e.activityId, {
        rating: e.rating ?? undefined,
        comment: e.feedbackComment ?? undefined,
        carbsG: e.carbsIngested ?? undefined,
        createdAt: e.date.getTime(),
      });
    }
  }

  // 1. Apply rule-based adaptations (fuel + swap)
  // When sugar mode is off, pass null bgModel to skip fuel adaptations
  const adapted = applyAdaptations({
    upcomingEvents,
    bgModel: settings.diabetesMode ? bgModel : null,
    insights,
    runBGContexts: settings.diabetesMode ? runBGContexts : {},
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
          feedbackByActivity,
          maxHr,
          hrZones,
          paceTable,
          crossRunPatterns: patterns?.patternsText,
        });

        try {
          const result = await generateText({
            model: anthropic("claude-sonnet-4-6"),
            system,
            messages: [{ role: "user", content: user }],
          });

          const aiNotes = result.text;
          const description = assembleDescription(aiNotes, event.structure);

          return { ...event, notes: aiNotes, description };
        } catch {
          // Fall back to change summary if AI fails
          const fallbackNotes = event.changes.length > 0
            ? event.changes.map((c) => c.detail).join(". ") + "."
            : "No changes.";
          const description = assembleDescription(fallbackNotes, event.structure);
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
