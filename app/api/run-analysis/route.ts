import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { auth } from "@/lib/auth";
import {
  getRunAnalysis,
  saveRunAnalysis,
  getRecentAnalyzedRuns,
  type RunHistoryEntry,
} from "@/lib/runAnalysisDb";
import { getRunFeedbackByActivity, getRecentFeedback } from "@/lib/feedbackDb";
import { buildRunAnalysisPrompt } from "@/lib/runAnalysisPrompt";
import { getUserSettings } from "@/lib/settings";
import { fetchAthleteProfile, fetchActivitiesByDateRange } from "@/lib/intervalsApi";
import { formatAIError } from "@/lib/aiError";
import { NextResponse } from "next/server";
import type { CalendarEvent, IntervalsActivity } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import type { ReportCard } from "@/lib/reportCard";
import type { CachedRunRow } from "@/lib/runAnalysisDb";

interface RequestBody {
  activityId: string;
  event: CalendarEvent;
  runBGContext?: RunBGContext | null;
  reportCard?: ReportCard | null;
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

  const settings = await getUserSettings(session.user.email);

  const [rows, feedback, recentFeedback, profile] = await Promise.all([
    getRecentAnalyzedRuns(session.user.email),
    getRunFeedbackByActivity(session.user.email, activityId),
    getRecentFeedback(session.user.email),
    settings.intervalsApiKey
      ? fetchAthleteProfile(settings.intervalsApiKey)
      : Promise.resolve({} as { lthr?: number; maxHr?: number; hrZones?: number[] }),
  ]);

  // Batch-fetch activity metadata from Intervals.icu for the date range
  const activityMap = new Map<string, IntervalsActivity>();
  if (settings.intervalsApiKey && rows.length > 0) {
    const dates = rows
      .map((r) => r.activityDate)
      .filter((d): d is string => !!d);
    if (dates.length > 0) {
      const oldest = dates.reduce((a, b) => (a < b ? a : b));
      const newest = dates.reduce((a, b) => (a > b ? a : b));
      try {
        const activities = await fetchActivitiesByDateRange(settings.intervalsApiKey, oldest, newest);
        for (const a of activities) {
          activityMap.set(a.id, a);
        }
      } catch {
        // API unavailable — build history without metadata
      }
    }
  }

  const history = buildRunHistory(rows, activityMap);

  const historyFeedbackMap = new Map(
    recentFeedback
      .filter((fb): fb is typeof fb & { activityId: string } => !!fb.activityId)
      .map((fb) => [fb.activityId, fb]),
  );

  const { system, user } = buildRunAnalysisPrompt({
    event,
    runBGContext,
    reportCard,
    history,
    historyFeedback: historyFeedbackMap,
    athleteFeedback: feedback ? { rating: feedback.rating, comment: feedback.comment, carbsG: feedback.carbsG } : undefined,
    lthr: profile.lthr,
    maxHr: profile.maxHr,
    hrZones: profile.hrZones,
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
