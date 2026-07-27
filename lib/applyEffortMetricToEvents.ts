import { normalizeEffortMetric, type EffortMetric } from "./effortMetric";
import { parseEventId } from "./format";
import {
  reemitWorkoutDescription,
  reemitWorkoutName,
  type ReemitContext,
} from "./reemitWorkout";
import type { CalendarEvent } from "./types";

export interface EffortMetricEventPatch {
  id: string;
  numericId: number;
  name: string;
  description: string;
  previousName: string;
  date: Date;
  fuelRate?: number | null;
}

export interface EffortMetricPatchFailure {
  id: string;
  name: string;
  error: string;
}

export interface EffortMetricPatchResult {
  patches: EffortMetricEventPatch[];
  failures: EffortMetricPatchFailure[];
}

function startOfToday(now: Date): Date {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Build name/description patches for future planned events under a target effort metric.
 * Unparseable events are recorded as failures and skipped (no partial description write).
 */
export function buildFuturePlannedEffortPatches(
  events: CalendarEvent[],
  target: EffortMetric,
  ctx: ReemitContext,
  now = new Date(),
): EffortMetricPatchResult {
  const metric = normalizeEffortMetric(target);
  const today = startOfToday(now);
  const patches: EffortMetricEventPatch[] = [];
  const failures: EffortMetricPatchFailure[] = [];

  for (const event of events) {
    if (event.type !== "planned" || event.date < today) continue;

    const numericId = parseEventId(event.id);
    if (Number.isNaN(numericId)) {
      failures.push({
        id: event.id,
        name: event.name,
        error: `Invalid event id: ${event.id}`,
      });
      continue;
    }

    try {
      patches.push({
        id: event.id,
        numericId,
        name: reemitWorkoutName(event.name, metric),
        description: reemitWorkoutDescription(event.description, metric, ctx),
        previousName: event.name,
        date: event.date,
        fuelRate: event.fuelRate,
      });
    } catch (err) {
      failures.push({
        id: event.id,
        name: event.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { patches, failures };
}
