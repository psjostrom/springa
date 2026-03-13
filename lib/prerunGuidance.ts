import type { IntervalsEvent } from "./types";
import type { XdripReading } from "./xdrip";
import type { BGResponseModel } from "./bgModel";
import { computeTrend } from "./xdrip";
import { getWorkoutCategory } from "./constants";
import { assessReadiness, formatGuidancePush } from "./prerun";

interface PrerunGuidanceInput {
  event: IntervalsEvent;
  readings: XdripReading[];
  bgModel: BGResponseModel;
  currentTsb: number | null;
  currentIob: number | null;
  now: number;
  staleThresholdMs: number;
}

interface PrerunGuidanceResult {
  title: string;
  body: string;
  eventId: string;
}

/** Build pre-run push notification content for a single event.
 *  Returns null if readings are empty or stale. */
export function buildEventGuidance(
  input: PrerunGuidanceInput,
): PrerunGuidanceResult | null {
  const { event, readings, bgModel, currentTsb, currentIob, now, staleThresholdMs } =
    input;

  if (readings.length === 0) {
    return null;
  }

  const lastReading = readings[readings.length - 1];
  if (now - lastReading.ts > staleThresholdMs) {
    return null;
  }

  const trendResult = computeTrend(readings);
  const trendSlope = trendResult?.slope ?? null;

  const currentBG = lastReading.mmol;
  const rawCategory = getWorkoutCategory(event.name ?? "");
  const category = rawCategory === "other" ? "easy" : rawCategory;

  const guidance = assessReadiness({
    currentBG,
    trendSlope,
    bgModel,
    category,
    currentTsb,
    iob: currentIob,
  });

  const { title, body } = formatGuidancePush(guidance, currentBG);
  const eventId = `event-${event.id}`;

  return { title, body, eventId };
}
