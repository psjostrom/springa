import { getMyLifeData } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { getRecentAnalyzedRuns, buildRunHistory } from "@/lib/runAnalysisDb";
import { fetchAthleteProfile, fetchActivitiesByDateRange, fetchWellnessData } from "@/lib/intervalsApi";
import { wellnessToFitnessData, computeInsights } from "@/lib/fitness";
import { enrichActivitiesWithGlucose } from "@/lib/activityStreamsEnrich";
import { enrichWithGlucose } from "@/lib/bgAlignment";
import { nonEmpty } from "@/lib/format";
import { buildInsulinContext } from "@/lib/insulinContext";
import { format, subDays } from "date-fns";
import { getBGPatterns } from "@/lib/bgPatternsDb";
import { fetchBGFromNS } from "@/lib/nightscout";
import { getBGReadingsForRange } from "@/lib/bgDb";
import type { CalendarEvent, IntervalsActivity } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import type { ReportCard } from "@/lib/reportCard";
import type { RunHistoryEntry } from "@/lib/runAnalysisDb";
import type { InsulinContext } from "@/lib/insulinContext";
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
  insulinContext?: InsulinContext | null;
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

  // Start MyLife fetch in parallel (doesn't depend on rows/feedback/profile)
  const creds = await getUserCredentials(email);
  const insulinContextP = (creds?.mylifeEmail && creds.mylifePassword
    ? getMyLifeData(creds.mylifeEmail, creds.mylifePassword, creds.timezone)
    : Promise.resolve(null))
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
    fetchAthleteProfile(intervalsApiKey),
    getBGPatterns(email),
    fetchWellnessData(intervalsApiKey, format(subDays(new Date(), 365), "yyyy-MM-dd"), format(new Date(), "yyyy-MM-dd")),
  ]);

  // Enrich history rows with glucose from Nightscout (if configured) or local cache as fallback
  let rows;
  if (nightscoutUrl && nightscoutSecret && rawRows.length > 0) {
    // Compute time range for BG fetch
    const startMsValues = rawRows
      .map((a) => a.runStartMs)
      .filter((ms): ms is number => ms != null);

    if (startMsValues.length > 0) {
      const minMs = Math.min(...startMsValues);
      const maxMs = Math.max(
        ...rawRows
          .flatMap((a) => {
            if (a.runStartMs == null) return [];
            const dur = a.hr.length > 0 ? a.hr[a.hr.length - 1].time * 60 * 1000 : 0;
            return [a.runStartMs + dur];
          }),
      );

      try {
        const bgReadings = await fetchBGFromNS(nightscoutUrl, nightscoutSecret, {
          since: minMs,
          until: maxMs,
          count: 10000,
        });
        rows = enrichWithGlucose(rawRows, bgReadings);
      } catch (err) {
        console.warn("[RunAnalysis] Failed to fetch BG from Nightscout, falling back to local cache:", err);
        // Fall back to local DB
        const localReadings = await getBGReadingsForRange(email, minMs, maxMs);
        rows = enrichWithGlucose(rawRows, localReadings);
      }
    } else {
      rows = rawRows;
    }
  } else {
    // No NS configured, use local cache
    rows = await enrichActivitiesWithGlucose(email, rawRows);
  }

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

  const insulinContext = await insulinContextP;
  console.log(`[RunAnalysis] Insulin context: ${insulinContext ? "built" : "null (no boluses in window or no credentials)"}`);

  // Current run feedback from CalendarEvent custom fields
  const athleteFeedback = (event.rating || event.feedbackComment)
    ? { rating: event.rating ?? undefined, comment: event.feedbackComment ?? undefined, carbsG: event.carbsIngested ?? undefined }
    : undefined;

  return {
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
  };
}
