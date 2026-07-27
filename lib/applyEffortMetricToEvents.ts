import {
  detectEffortMetric,
  normalizeEffortMetric,
  type EffortMetric,
} from "./effortMetric";
import { parseEventId } from "./format";
import {
  reemitWorkoutDescription,
  reemitWorkoutName,
  type ReemitContext,
} from "./reemitWorkout";
import type { CalendarEvent } from "./types";

export type EffortMetricPatchTarget = EffortMetric | "per-workout";

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
 * When plan effortMetric changed → force that metric on every future workout.
 * When only ability/threshold changed → preserve each workout's detected metric.
 * When there is no lastGeneratedConfig baseline, force the snapshot metric.
 */
export function resolveBulkEffortMetricTarget(
  snapshotEffortMetric: unknown,
  lastGeneratedConfig: string | null,
): EffortMetricPatchTarget {
  const next = normalizeEffortMetric(snapshotEffortMetric);
  if (!lastGeneratedConfig) return next;
  try {
    const stored = JSON.parse(lastGeneratedConfig) as { effortMetric?: unknown };
    const prev = normalizeEffortMetric(stored.effortMetric);
    return next === prev ? "per-workout" : next;
  } catch {
    return next;
  }
}

/**
 * First future planned workout whose detected metric differs from `targetMetric`.
 * Used when lastGeneratedConfig is missing (pre-feature / other browser).
 * Returns the detected metric of that workout, or null if all match.
 */
export function findFuturePlannedEffortMetricMismatch(
  events: CalendarEvent[],
  targetMetric: EffortMetric,
  now = new Date(),
): EffortMetric | null {
  const today = startOfToday(now);
  for (const event of events) {
    if (event.type !== "planned" || event.date < today) continue;
    const detected = detectEffortMetric(event.name, event.description ?? "");
    if (detected !== targetMetric) return detected;
  }
  return null;
}

export function formatBulkReemitStatus(
  succeeded: number,
  failures: { name: string }[],
): string {
  if (failures.length === 0) {
    return succeeded > 0
      ? `Updated ${succeeded} workout${succeeded === 1 ? "" : "s"}.`
      : "";
  }
  const names = failures.map((f) => f.name).join(", ");
  return `Updated ${succeeded} workout${succeeded === 1 ? "" : "s"}. ${failures.length} failed: ${names}.`;
}

/**
 * Build name/description patches for future planned events under a target effort metric.
 * Unparseable events are recorded as failures and skipped (no partial description write).
 * Pass `"per-workout"` to re-emit each event using its detected metric (ability-only updates).
 */
export function buildFuturePlannedEffortPatches(
  events: CalendarEvent[],
  target: EffortMetricPatchTarget,
  ctx: ReemitContext,
  now = new Date(),
): EffortMetricPatchResult {
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

    const metric =
      target === "per-workout"
        ? detectEffortMetric(event.name, event.description)
        : normalizeEffortMetric(target);

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
