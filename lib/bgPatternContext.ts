import { fetchWellnessData } from "@/lib/intervalsApi";
import { wellnessToFitnessData } from "@/lib/fitness";
import {
  buildEnrichedRunTable,
  formatRunTable,
  type EnrichedRun,
} from "@/lib/bgPatterns";
import type { CalendarEvent } from "@/lib/types";
import { buildRunBGContexts } from "@/lib/runBGContext";
import { fetchBGFromNS } from "@/lib/nightscout";
import { format } from "date-fns";

export interface BGPatternInput {
  email: string;
  events: CalendarEvent[]; // events with dates already restored
  intervalsApiKey: string;
  nightscoutUrl?: string;
  nightscoutSecret?: string;
}

export interface BGPatternContext {
  enrichedRuns: EnrichedRun[];
  table: string; // TSV formatted
  runCount: number;
  latestActivityId: string; // most recent completed run with glucose data
}

export async function buildBGPatternContext(
  input: BGPatternInput,
): Promise<BGPatternContext> {
  const { events, intervalsApiKey, nightscoutUrl, nightscoutSecret } = input;

  const completedEvents = events.filter((e) => e.type === "completed");

  const completedDates = completedEvents.map((e) =>
    format(e.date, "yyyy-MM-dd"),
  );
  const timestamps = completedEvents.map((e) => e.date.getTime());
  const durations = completedEvents.map((e) => (e.duration ?? 0) * 1000);

  // Need readings from 1h before earliest run to 2h after latest run end
  const earliestMs = Math.min(...timestamps) - 60 * 60 * 1000;
  const latestMs =
    Math.max(...timestamps.map((t, i) => t + durations[i])) +
    2 * 60 * 60 * 1000;

  // Fetch wellness and CGM readings
  let wellness: Awaited<ReturnType<typeof fetchWellnessData>> = [];
  if (intervalsApiKey && completedDates.length > 0) {
    const oldest = completedDates.reduce((a, b) => (a < b ? a : b));
    const newest = completedDates.reduce((a, b) => (a > b ? a : b));
    wellness = await fetchWellnessData(intervalsApiKey, oldest, newest);
  }

  // Convert wellness data to fitness points (CTL/ATL/TSB from Intervals.icu)
  const fitnessData = wellnessToFitnessData(wellness);

  // Fetch BG readings from Nightscout
  let bgReadings: Awaited<ReturnType<typeof fetchBGFromNS>> = [];
  if (nightscoutUrl && nightscoutSecret) {
    try {
      bgReadings = await fetchBGFromNS(nightscoutUrl, nightscoutSecret, {
        since: earliestMs,
        until: latestMs,
        count: 10000,
      });
    } catch {
      console.warn("[BGPatterns] Failed to fetch BG from Nightscout");
      bgReadings = [];
    }
  }

  // Build RunBGContexts from the full CGM dataset
  const bgContextMap = buildRunBGContexts(completedEvents, bgReadings);
  const bgContexts: Record<
    string,
    import("@/lib/runBGContext").RunBGContext
  > = {};
  for (const [key, value] of bgContextMap) {
    bgContexts[key] = value;
  }

  // Insulin contexts no longer available (MyLife removed)
  const insulinContexts: Record<string, never> = {};

  // Build enriched run table
  const enrichedRuns = buildEnrichedRunTable(
    events,
    fitnessData,
    wellness,
    bgContexts,
    insulinContexts,
  );

  const table = formatRunTable(enrichedRuns);

  // Find the most recent completed run with glucose data to track staleness
  const withGlucose = completedEvents
    .filter((e) => e.activityId && e.glucose)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const latestActivityId = withGlucose[0]?.activityId ?? "";

  return {
    enrichedRuns,
    table,
    runCount: enrichedRuns.length,
    latestActivityId,
  };
}
