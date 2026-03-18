import { getMyLifeData } from "@/lib/apiHelpers";
import { fetchWellnessData } from "@/lib/intervalsApi";
import { wellnessToFitnessData } from "@/lib/fitness";
import {
  buildEnrichedRunTable,
  formatRunTable,
  type EnrichedRun,
} from "@/lib/bgPatterns";
import { buildInsulinContext, type InsulinContext } from "@/lib/insulinContext";
import type { CalendarEvent } from "@/lib/types";
import { buildRunBGContexts } from "@/lib/runBGContext";
import { getBGReadings, monthKey } from "@/lib/bgDb";
import { format } from "date-fns";

export interface BGPatternInput {
  email: string;
  events: CalendarEvent[]; // events with dates already restored
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
  const { email, events } = input;
  const intervalsApiKey = process.env.INTERVALS_API_KEY;

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

  // Compute which months we need for CGM
  const neededMonths = new Set<string>();
  let cursor = earliestMs;
  while (cursor < latestMs) {
    neededMonths.add(monthKey(cursor));
    // Jump to next month
    const d = new Date(cursor);
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
    cursor = d.getTime();
  }
  neededMonths.add(monthKey(latestMs));

  // Start MyLife fetch in parallel (doesn't depend on wellness or CGM)
  const mylifeDataP = getMyLifeData();

  // Fetch wellness and CGM readings (parallel with MyLife)
  let wellness: Awaited<ReturnType<typeof fetchWellnessData>> = [];
  if (intervalsApiKey && completedDates.length > 0) {
    const oldest = completedDates.reduce((a, b) => (a < b ? a : b));
    const newest = completedDates.reduce((a, b) => (a > b ? a : b));
    wellness = await fetchWellnessData(intervalsApiKey, oldest, newest);
  }

  // Convert wellness data to fitness points (CTL/ATL/TSB from Intervals.icu)
  const fitnessData = wellnessToFitnessData(wellness);

  const bgReadings = await getBGReadings(email, [...neededMonths]);

  // Build RunBGContexts from the full CGM dataset
  const bgContextMap = buildRunBGContexts(completedEvents, bgReadings);
  const bgContexts: Record<
    string,
    import("@/lib/runBGContext").RunBGContext
  > = {};
  for (const [key, value] of bgContextMap) {
    bgContexts[key] = value;
  }

  // Build insulin contexts from MyLife data
  const insulinContexts: Record<string, InsulinContext> = {};
  const mylifeData = await mylifeDataP;
  if (mylifeData) {
    for (const event of completedEvents) {
      if (!event.activityId) continue;
      const ctx = buildInsulinContext(mylifeData, event.date.getTime());
      if (ctx) {
        insulinContexts[event.activityId] = ctx;
      }
    }
  }

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
