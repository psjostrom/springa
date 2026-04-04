import { getUserCredentials } from "@/lib/credentials";
import { getRecentAnalyzedRuns, buildRunHistory } from "@/lib/runAnalysisDb";
import { fetchAthleteProfile, fetchActivitiesByDateRange, fetchWellnessData } from "@/lib/intervalsApi";
import { wellnessToFitnessData, computeInsights } from "@/lib/fitness";
import { enrichActivitiesWithGlucose } from "@/lib/activityStreamsEnrich";
import { enrichWithGlucose } from "@/lib/bgAlignment";
import { nonEmpty } from "@/lib/format";
import { format, subDays } from "date-fns";
import { getBGPatterns } from "@/lib/bgPatternsDb";
import { fetchBGFromNS } from "@/lib/nightscout";
import type { CalendarEvent, IntervalsActivity } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import type { ReportCard } from "@/lib/reportCard";
import type { RunHistoryEntry } from "@/lib/runAnalysisDb";
import type { FitnessInsights } from "@/lib/fitness";

interface BuildRunAnalysisContextInput {
  email: string;
  event: CalendarEvent;
  runStartMs: number;
  intervalsApiKey: string;
  runBGContext?: RunBGContext | null;
  reportCard?: ReportCard | null;
  bgModelSummary?: string;
  nightscoutUrl?: string;
  nightscoutSecret?: string;
}

interface RunAnalysisContextResult {
  event: CalendarEvent;
  runBGContext?: RunBGContext | null;
  reportCard?: ReportCard | null;
  history?: RunHistoryEntry[];
  historyFeedback?: Map<string, { rating?: string; comment?: string; carbsG?: number }>;
  athleteFeedback?: { rating?: string; comment?: string; carbsG?: number } | null;
  lthr?: number;
  maxHr?: number;
  hrZones: number[];
  fitnessInsights?: FitnessInsights | null;
  bgModelSummary?: string;
  crossRunPatterns?: string;
}

export async function buildRunAnalysisContext(
  input: BuildRunAnalysisContextInput,
): Promise<RunAnalysisContextResult> {
  const { email, event, runStartMs, intervalsApiKey, runBGContext, reportCard, bgModelSummary, nightscoutUrl, nightscoutSecret } = input;

  console.log(`[RunAnalysis] Activity ${event.activityId}, run start: ${event.date.toISOString()}`);

  const [rawRows, profile, patterns, wellnessEntries] = await Promise.all([
    getRecentAnalyzedRuns(email),
    fetchAthleteProfile(intervalsApiKey),
    getBGPatterns(email),
    fetchWellnessData(intervalsApiKey, format(subDays(new Date(), 365), "yyyy-MM-dd"), format(new Date(), "yyyy-MM-dd")),
  ]);

  // Enrich history rows with glucose from Nightscout
  const rows = await enrichActivitiesWithGlucose(email, rawRows);

  // Batch-fetch activity metadata from Intervals.icu for run history
  const activityMap = new Map<string, IntervalsActivity>();
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

  // Current run feedback from CalendarEvent custom fields
  const athleteFeedback = (event.rating || event.feedbackComment)
    ? { rating: event.rating ?? undefined, comment: event.feedbackComment ?? undefined, carbsG: event.carbsIngested ?? undefined }
    : undefined;

  return {
    event,
    runBGContext,
    reportCard,
    history,
    historyFeedback: historyFeedbackMap,
    athleteFeedback,
    lthr: profile.lthr,
    maxHr: profile.maxHr,
    hrZones: profile.hrZones ?? [],
    fitnessInsights,
    bgModelSummary,
    crossRunPatterns: patterns?.patternsText,
  };
}
