import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { auth } from "@/lib/auth";
import {
  getRunAnalysis,
  saveRunAnalysis,
  getRecentAnalyzedRuns,
  type RunHistoryEntry,
} from "@/lib/runAnalysisDb";
import { buildRunAnalysisPrompt } from "@/lib/runAnalysisPrompt";
import { fetchAthleteProfile, fetchActivitiesByDateRange } from "@/lib/intervalsApi";
import { computeFitnessData, computeInsights } from "@/lib/fitness";
import { formatAIError } from "@/lib/aiError";
import { nonEmpty } from "@/lib/format";
import { signIn as mylifeSignIn, fetchMyLifeData, clearSession as clearMyLifeSession } from "@/lib/mylife";
import { buildInsulinContext } from "@/lib/insulinContext";
import { format, subDays } from "date-fns";
import { NextResponse } from "next/server";
import type { CalendarEvent, IntervalsActivity } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import type { ReportCard } from "@/lib/reportCard";
import type { CachedRunRow } from "@/lib/runAnalysisDb";
import { getBGPatterns } from "@/lib/bgPatternsDb";

interface RequestBody {
  activityId: string;
  event: CalendarEvent;
  runBGContext?: RunBGContext | null;
  reportCard?: ReportCard | null;
  bgModelSummary?: string;
  regenerate?: boolean;
}

function buildRunHistory(
  rows: CachedRunRow[],
  activityMap: Map<string, IntervalsActivity>,
): RunHistoryEntry[] {
  return rows.map((row) => {
    const { glucose, hr, activityId, category, activityDate } = row;

    const endBG = glucose.length > 0 ? glucose[glucose.length - 1].value : null;
    const avgHRFromStream = hr.length > 0
      ? Math.round(hr.reduce((sum, point) => sum + point.value, 0) / hr.length)
      : null;

    let dropRate: number | null = null;
    if (glucose.length >= 2) {
      const durationMin = glucose[glucose.length - 1].time - glucose[0].time;
      const duration10m = durationMin / 10;
      if (duration10m > 0) {
        dropRate = (glucose[glucose.length - 1].value - glucose[0].value) / duration10m;
      }
    }

    const activity = activityMap.get(activityId);

    const distanceKm = activity?.distance ? activity.distance / 1000 : undefined;
    const durationMinCalc = activity?.moving_time ? activity.moving_time / 60 : undefined;
    let pace: number | undefined;
    if (distanceKm && durationMinCalc && distanceKm > 0) {
      pace = durationMinCalc / distanceKm;
    }

    const event: CalendarEvent = {
      id: `activity-${activityId}`,
      activityId,
      date: activityDate ? new Date(activityDate) : new Date(),
      name: activity?.name ?? `${category} run`,
      description: "",
      type: "completed",
      category: category as CalendarEvent["category"],
      distance: activity?.distance,
      duration: activity?.moving_time,
      pace: activity?.pace ? 1000 / (activity.pace * 60) : pace,
      avgHr: (activity?.average_heartrate ?? activity?.average_hr) ?? avgHRFromStream ?? undefined,
      maxHr: activity?.max_heartrate ?? activity?.max_hr,
      load: activity?.icu_training_load,
      fuelRate: row.fuelRate,
      carbsIngested: activity?.carbs_ingested ?? null,
      preRunCarbsG: activity?.PreRunCarbsG === 0 ? null : activity?.PreRunCarbsG ?? null,
      preRunCarbsMin: activity?.PreRunCarbsMin === 0 ? null : activity?.PreRunCarbsMin ?? null,
      rating: nonEmpty(activity?.Rating),
      feedbackComment: nonEmpty(activity?.FeedbackComment),
    };

    return {
      event,
      bgSummary: { startBG: row.startBG, endBG, dropRate },
    };
  });
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
    const cached = await getRunAnalysis(session.user.email, activityId);
    if (cached) {
      return NextResponse.json({ analysis: cached });
    }
  }

  const intervalsApiKey = process.env.INTERVALS_API_KEY;
  const mylifeEmail = process.env.MYLIFE_EMAIL;
  const mylifePassword = process.env.MYLIFE_PASSWORD;
  const mylifeTz = process.env.TIMEZONE ?? "Europe/Stockholm";
  const runStartMs = event.date.getTime();

  console.log(`[RunAnalysis] Activity ${activityId}, run start: ${event.date.toISOString()}`);
  console.log(`[RunAnalysis] MyLife credentials: ${mylifeEmail ? "configured" : "NOT configured"}`);

  // Start MyLife fetch in parallel (doesn't depend on rows/feedback/profile)
  const insulinContextP = mylifeEmail && mylifePassword
    ? mylifeSignIn(mylifeEmail, mylifePassword)
        .then((session) => fetchMyLifeData(session, mylifeTz))
        .then((data) => {
          console.log(`[RunAnalysis] MyLife data fetched: ${data.events.length} events`);
          return buildInsulinContext(data, runStartMs);
        })
        .catch((err: unknown) => {
          console.error("[RunAnalysis] MyLife fetch failed:", err);
          clearMyLifeSession(mylifeEmail);
          return null;
        })
    : Promise.resolve(null);

  const [rows, profile, patterns] = await Promise.all([
    getRecentAnalyzedRuns(session.user.email),
    intervalsApiKey
      ? fetchAthleteProfile(intervalsApiKey)
      : Promise.resolve({} as { lthr?: number; maxHr?: number; hrZones?: number[] }),
    getBGPatterns(session.user.email),
  ]);

  // Batch-fetch activity metadata from Intervals.icu
  // Fetch 90 days to support both run history and fitness computation (CTL needs 42-day warm-up)
  const activityMap = new Map<string, IntervalsActivity>();
  let allActivities: IntervalsActivity[] = [];
  if (intervalsApiKey) {
    const oldest90d = format(subDays(new Date(), 90), "yyyy-MM-dd");
    const today = format(new Date(), "yyyy-MM-dd");
    // Widen to include cached run dates if they go further back
    const rowDates = rows.map((r) => r.activityDate).filter((d): d is string => !!d);
    const fetchOldest = rowDates.length > 0
      ? rowDates.reduce((a, b) => (a < b ? a : b), oldest90d)
      : oldest90d;
    try {
      allActivities = await fetchActivitiesByDateRange(intervalsApiKey, fetchOldest, today);
      for (const a of allActivities) {
        activityMap.set(a.id, a);
      }
    } catch {
      // API unavailable — build history without metadata
    }
  }

  // Compute fitness from fetched activities
  const fitnessEvents: CalendarEvent[] = allActivities
    .filter((a): a is IntervalsActivity & { icu_training_load: number; start_date_local: string } =>
      !!a.icu_training_load && !!a.start_date_local)
    .map((a) => ({
      id: a.id,
      date: new Date(a.start_date_local),
      name: a.name,
      description: "",
      type: "completed" as const,
      category: "easy" as const, // category doesn't matter for fitness computation
      load: a.icu_training_load,
    }));
  const fitnessData = computeFitnessData(fitnessEvents, 90);
  const fitnessInsights = fitnessEvents.length > 0
    ? computeInsights(fitnessData, fitnessEvents)
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
    await saveRunAnalysis(session.user.email, activityId, analysis);

    return NextResponse.json({ analysis });
  } catch (err) {
    const { message, status } = formatAIError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
