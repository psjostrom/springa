import type { IntervalsEvent } from "./types";
import type { XdripReading } from "./xdrip";
import type { CachedActivity, EnrichedActivity } from "./activityStreamsDb";
import { computeTrend } from "./xdrip";
import { enrichActivitiesWithGlucose } from "./activityStreamsEnrich";
import { buildBGModelFromCached } from "./bgModel";
import { getWorkoutCategory } from "./constants";
import { assessReadiness, formatGuidancePush } from "./prerun";

interface PrerunGuidanceInput {
  event: IntervalsEvent;
  email: string;
  readings: XdripReading[];
  cached: CachedActivity[];
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
export async function buildEventGuidance(
  input: PrerunGuidanceInput,
): Promise<PrerunGuidanceResult | null> {
  const { event, email, readings, cached, currentTsb, currentIob, now, staleThresholdMs } =
    input;

  // Check readings not empty
  if (readings.length === 0) {
    return null;
  }

  // Check latest reading not stale
  const lastReading = readings[readings.length - 1];
  if (now - lastReading.ts > staleThresholdMs) {
    return null;
  }

  // Compute trend from readings
  const trendResult = computeTrend(readings);
  const trendSlope = trendResult?.slope ?? null;

  // Enrich cached activities with glucose
  const enriched: EnrichedActivity[] = await enrichActivitiesWithGlucose(email, cached);

  // Build BG model from enriched activities
  const bgModel = buildBGModelFromCached(enriched);

  // Get current BG and resolve workout category
  const currentBG = lastReading.mmol;
  const rawCategory = getWorkoutCategory(event.name ?? "");
  const category = rawCategory === "other" ? "easy" : rawCategory;

  // Assess readiness
  const guidance = assessReadiness({
    currentBG,
    trendSlope,
    bgModel,
    category,
    currentTsb,
    iob: currentIob,
  });

  // Format guidance push
  const { title, body } = formatGuidancePush(guidance, currentBG);
  const eventId = `event-${event.id}`;

  return { title, body, eventId };
}
