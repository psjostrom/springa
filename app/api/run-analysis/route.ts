import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireAuth, unauthorized, AuthError, getMyLifeData } from "@/lib/apiHelpers";
import {
  getRunAnalysis,
  saveRunAnalysis,
  getRecentAnalyzedRuns,
  buildRunHistory,
} from "@/lib/runAnalysisDb";
import { buildRunAnalysisPrompt } from "@/lib/runAnalysisPrompt";
import { fetchAthleteProfile, fetchActivitiesByDateRange, fetchWellnessData } from "@/lib/intervalsApi";
import { wellnessToFitnessData, computeInsights } from "@/lib/fitness";
import { formatAIError } from "@/lib/aiError";
import { enrichActivitiesWithGlucose } from "@/lib/activityStreamsEnrich";
import { nonEmpty } from "@/lib/format";
import { buildInsulinContext } from "@/lib/insulinContext";
import { format, subDays } from "date-fns";
import { NextResponse } from "next/server";
import type { CalendarEvent, IntervalsActivity } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import type { ReportCard } from "@/lib/reportCard";
import { getBGPatterns } from "@/lib/bgPatternsDb";

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

  const intervalsApiKey = process.env.INTERVALS_API_KEY;
  const runStartMs = event.date.getTime();

  console.log(`[RunAnalysis] Activity ${activityId}, run start: ${event.date.toISOString()}`);

  // Start MyLife fetch in parallel (doesn't depend on rows/feedback/profile)
  const insulinContextP = getMyLifeData()
    .then((data) => {
      if (!data) return null;
      console.log(`[RunAnalysis] MyLife data fetched: ${data.events.length} events`);
      return buildInsulinContext(data, runStartMs);
    })
    .catch((err: unknown) => {
      console.error("[RunAnalysis] MyLife fetch failed:", err);
      return null;
    });

  const [rawRows, profile, patterns, wellnessEntries] = await Promise.all([
    getRecentAnalyzedRuns(email),
    intervalsApiKey
      ? fetchAthleteProfile(intervalsApiKey)
      : Promise.resolve({} as { lthr?: number; maxHr?: number; hrZones?: number[] }),
    getBGPatterns(email),
    intervalsApiKey
      ? fetchWellnessData(intervalsApiKey, format(subDays(new Date(), 365), "yyyy-MM-dd"), format(new Date(), "yyyy-MM-dd"))
      : Promise.resolve([]),
  ]);

  // Enrich history rows with glucose from xdrip_readings
  const rows = await enrichActivitiesWithGlucose(email, rawRows);

  // Batch-fetch activity metadata from Intervals.icu for run history
  const activityMap = new Map<string, IntervalsActivity>();
  if (intervalsApiKey) {
    const rowDates = rows.map((r) => r.activityDate).filter((d): d is string => !!d);
    const oldest = rowDates.length > 0
      ? rowDates.reduce((a, b) => (a < b ? a : b))
      : format(subDays(new Date(), 90), "yyyy-MM-dd");
    const today = format(new Date(), "yyyy-MM-dd");
    try {
      const allActivities = await fetchActivitiesByDateRange(intervalsApiKey, oldest, today);
      for (const a of allActivities) {
        activityMap.set(a.id, a);
      }
    } catch (err) {
      console.warn("[run-analysis] Failed to fetch activity metadata:", err);
    }
  }

  // Fitness data from Intervals.icu wellness (authoritative CTL/ATL/TSB)
  const fitnessData = wellnessToFitnessData(wellnessEntries);
  // Empty events array — this route doesn't have calendar events, so activity
  // counts (totalActivities7d etc.) will be 0. The prompt only uses CTL/ATL/TSB/rampRate.
  const fitnessInsights = fitnessData.length > 0
    ? computeInsights(fitnessData, [])
    : null;

  const history = buildRunHistory(rows, activityMap);

  // Build history feedback from activity custom fields
  const historyFeedbackMap = new Map<string, { rating?: string; comment?: string; carbsG?: number }>();
  for (const [id, activity] of activityMap) {
    if (nonEmpty(activity.Rating) ?? nonEmpty(activity.FeedbackComment)) {
      historyFeedbackMap.set(id, {
        rating: nonEmpty(activity.Rating) ?? undefined,
        comment: nonEmpty(activity.FeedbackComment) ?? undefined,
        carbsG: activity.carbs_ingested ?? undefined,
      });
    }
  }

  const insulinContext = await insulinContextP;
  console.log(`[RunAnalysis] Insulin context: ${insulinContext ? "built" : "null (no boluses in window or no credentials)"}`);

  // Current run feedback from CalendarEvent custom fields
  const athleteFeedback = (event.rating || event.feedbackComment)
    ? { rating: event.rating ?? undefined, comment: event.feedbackComment ?? undefined, carbsG: event.carbsIngested ?? undefined }
    : undefined;

  const { system, user } = buildRunAnalysisPrompt({
    event,
    runBGContext,
    reportCard,
    insulinContext,
    history,
    historyFeedback: historyFeedbackMap,
    athleteFeedback,
    lthr: profile.lthr,
    maxHr: profile.maxHr,
    hrZones: profile.hrZones ?? [],
    fitnessInsights,
    bgModelSummary,
    crossRunPatterns: patterns?.patternsText,
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
    await saveRunAnalysis(email, activityId, analysis);

    return NextResponse.json({ analysis });
  } catch (err) {
    const { message, status } = formatAIError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
