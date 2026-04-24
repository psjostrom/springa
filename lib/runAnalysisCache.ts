import type { CalendarEvent } from "./types";
import type { RunBGContext } from "./runBGContext";
import type { ReportCard } from "./reportCard";
import { buildReportCard } from "./reportCard";
import { summarizeBGModel, type BGResponseModel } from "./bgModel";

interface RunAnalysisCacheInput {
  event: CalendarEvent;
  diabetesMode: boolean;
  runBGContext?: RunBGContext | null;
  reportCard?: ReportCard | null;
  bgModelSummary?: string;
}

interface RunAnalysisClientCacheInput {
  event: CalendarEvent;
  diabetesMode: boolean;
  runBGContext?: RunBGContext | null;
  bgModel?: BGResponseModel | null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function summarizeEvent(event: CalendarEvent) {
  const glucose = event.glucose && event.glucose.length > 0
    ? {
        start: event.glucose[0].value,
        end: event.glucose[event.glucose.length - 1].value,
        min: Math.min(...event.glucose.map((point) => point.value)),
        max: Math.max(...event.glucose.map((point) => point.value)),
        points: event.glucose.length,
      }
    : null;

  return {
    id: event.id,
    activityId: event.activityId ?? null,
    date: event.date.toISOString(),
    name: event.name,
    category: event.category,
    type: event.type,
    distance: event.distance ?? null,
    duration: event.duration ?? null,
    pace: event.pace ?? null,
    avgHr: event.avgHr ?? null,
    maxHr: event.maxHr ?? null,
    load: event.load ?? null,
    fuelRate: event.fuelRate ?? null,
    carbsIngested: event.carbsIngested ?? null,
    preRunCarbsG: event.preRunCarbsG ?? null,
    rating: event.rating ?? null,
    feedbackComment: event.feedbackComment ?? null,
    zoneTimes: event.zoneTimes ?? null,
    glucose,
  };
}

export function buildRunAnalysisContextKey(input: RunAnalysisCacheInput): string {
  return stableStringify({
    diabetesMode: input.diabetesMode,
    event: summarizeEvent(input.event),
    runBGContext: input.diabetesMode ? input.runBGContext ?? null : null,
    reportCard: input.diabetesMode ? input.reportCard ?? null : null,
    bgModelSummary: input.diabetesMode ? input.bgModelSummary ?? null : null,
  });
}

export function buildRunAnalysisClientContextKey(
  input: RunAnalysisClientCacheInput,
): string {
  return buildRunAnalysisContextKey({
    event: input.event,
    diabetesMode: input.diabetesMode,
    runBGContext: input.runBGContext,
    reportCard: buildReportCard(input.event, input.runBGContext, input.diabetesMode),
    bgModelSummary: input.bgModel ? summarizeBGModel(input.bgModel) : undefined,
  });
}