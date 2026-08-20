import { alignHRWithBG } from "./bgAlignment";
import { activityToCalendarEvent } from "./calendarPipeline";
import { findCompletedActivityMatch } from "./completedActivityMatch";
import { getUserCredentials } from "./credentials";
import { fetchActivityByIdStrict, fetchActivityDetails } from "./intervalsApi";
import { fetchBGFromNS } from "./nightscout";
import { getPreRunCarbs } from "./prerunCarbs";
import { buildReportCard } from "./reportCard";
import { buildRunBGContext } from "./runBGContext";
import type { RunBGContext } from "./runBGContext";
import { computeKmSplits } from "./splits";
import type { CalendarEvent, StreamData } from "./types";

export interface BGScoreDto {
  rating: "good" | "ok" | "bad";
  startBG: number;
  minBG: number;
  hypo: boolean;
  worstRate: number;
  lbgi: number;
}

export interface HRZoneScoreDto {
  rating: "good" | "ok" | "bad";
  targetZone: string;
  pctInTarget: number;
  expectedRepSec?: number;
}

export interface EntryTrendScoreDto {
  rating: "good" | "ok" | "bad";
  slope30m: number;
  stability: number;
  label: string;
}

export interface RecoveryScoreDto {
  rating: "good" | "ok" | "bad";
  drop30m: number;
  nadir: number;
  postHypo: boolean;
  label: string;
}

export interface CompletedSplitDto {
  km: number;
  paceMinPerKm: number;
  avgHr: number | null;
  elevationChangeM: number | null;
}

export interface CompletedWorkoutOverviewDto {
  activityId: string;
  reportCard: {
    bg: BGScoreDto | null;
    hrZone: HRZoneScoreDto | null;
    entryTrend: EntryTrendScoreDto | null;
    recovery: RecoveryScoreDto | null;
  };
  splits: CompletedSplitDto[] | null;
  preRunCarbs: {
    grams: number | null;
    source: "activity" | "paired-event" | "none";
    fallbackEventId: number | null;
  };
}

// CGM window padding around the run: 60 min before (entry context) and 2 h after (recovery).
const BG_WINDOW_PRE_MS = 60 * 60 * 1000;
const BG_WINDOW_POST_MS = 2 * 60 * 60 * 1000;

/** Intervals.icu custom fields can't be null — 0 means "not set". */
function unsetIfZero(value: number | undefined): number | null {
  if (value === undefined || value === 0) return null;
  return value;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Row-level average HR and elevation change for each km split window. */
function enrichSplits(
  splits: ReturnType<typeof computeKmSplits>,
  streamData: StreamData,
): CompletedSplitDto[] {
  const { heartrate, altitude, rawTime = [] } = streamData;
  return splits.map((split) => {
    const hrWindow =
      heartrate?.filter((_, index) =>
        rawTime[index] >= split.startTimeSec && rawTime[index] < split.endTimeSec
      ) ?? [];
    const altWindow =
      altitude?.filter((_, index) =>
        rawTime[index] >= split.startTimeSec && rawTime[index] < split.endTimeSec
      ) ?? [];

    return {
      km: split.km,
      paceMinPerKm: round(split.paceMinPerKm, 2),
      avgHr:
        hrWindow.length > 0
          ? Math.round(hrWindow.reduce((sum, p) => sum + p.value, 0) / hrWindow.length)
          : null,
      elevationChangeM:
        altWindow.length >= 2
          ? round(altWindow[altWindow.length - 1].value - altWindow[0].value, 1)
          : null,
    };
  });
}

async function resolvePreRunCarbs(
  activity: { PreRunCarbsG?: number },
  matchedEventId: number | null,
  email: string,
): Promise<CompletedWorkoutOverviewDto["preRunCarbs"]> {
  const activityCarbs = unsetIfZero(activity.PreRunCarbsG);
  if (activityCarbs != null) {
    return { grams: activityCarbs, source: "activity", fallbackEventId: null };
  }

  const lookupEventId = matchedEventId;
  if (lookupEventId == null) {
    return { grams: null, source: "none", fallbackEventId: null };
  }

  try {
    const fallbackCarbs = await getPreRunCarbs(email, lookupEventId);
    return {
      grams: fallbackCarbs,
      source: fallbackCarbs != null ? "paired-event" : "none",
      fallbackEventId: lookupEventId,
    };
  } catch (error) {
    console.error(
      "[completedOverview] Failed to resolve pre-run carbs for event:",
      lookupEventId,
      error,
    );
    return { grams: null, source: "none", fallbackEventId: lookupEventId };
  }
}

export async function buildCompletedWorkoutOverview(options: {
  email: string;
  apiKey: string;
  activityId: string;
  diabetesMode: boolean;
}): Promise<CompletedWorkoutOverviewDto> {
  const { email, apiKey, activityId, diabetesMode } = options;

  const activity = await fetchActivityByIdStrict(apiKey, activityId);
  const [{ eventId }, details] = await Promise.all([
    findCompletedActivityMatch(apiKey, activity),
    fetchActivityDetails(activityId, apiKey),
  ]);
  const streamData = details.streamData;

  const event: CalendarEvent = activityToCalendarEvent(activity);
  const runStartMs = event.date.getTime();
  const runEndMs = runStartMs + (event.duration ?? 0) * 1000;

  let splits: CompletedSplitDto[] | null = null;
  if (streamData?.distance && streamData.rawTime) {
    splits = enrichSplits(
      computeKmSplits({ distance: streamData.distance, time: streamData.rawTime }),
      streamData,
    );
  }

  let runBGContext: RunBGContext | null | undefined;
  if (diabetesMode) {
    const creds = await getUserCredentials(email);
    if (creds?.nightscoutUrl && creds.nightscoutSecret) {
      try {
        const readings = await fetchBGFromNS(
          creds.nightscoutUrl,
          creds.nightscoutSecret,
          {
            since: runStartMs - BG_WINDOW_PRE_MS,
            until: runEndMs + BG_WINDOW_POST_MS,
            count: 1000,
          },
        );
        // NS returns newest first; alignHRWithBG/buildRunBGContext expect ASC.
        readings.sort((a, b) => a.ts - b.ts);

        if (streamData?.heartrate && readings.length > 0) {
          const aligned = alignHRWithBG(streamData.heartrate, readings, runStartMs);
          if (aligned) {
            event.glucose = aligned.glucose;
          }
        }
        runBGContext = buildRunBGContext(event, readings);
      } catch (error) {
        console.error(
          "[completedOverview] Failed to fetch BG context for activity:",
          activityId,
          error,
        );
      }
    }
  }

  const reportCard = buildReportCard(event, runBGContext, diabetesMode);
  return {
    activityId,
    reportCard: {
      bg: reportCard.bg,
      hrZone: reportCard.hrZone,
      entryTrend: reportCard.entryTrend,
      recovery: reportCard.recovery,
    },
    splits,
    preRunCarbs: await resolvePreRunCarbs(activity, eventId, email),
  };
}
