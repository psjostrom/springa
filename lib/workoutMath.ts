import {
  startOfWeek,
  addWeeks,
  differenceInCalendarWeeks,
  parseISO,
} from "date-fns";
import type { CalendarEvent, WorkoutEvent, PaceTable } from "./types";
import {
  parseWorkoutSegments,
  paceForIntensity,
  type WorkoutSegment,
} from "./descriptionParser";
import { DEFAULT_WORKOUT_DURATION_MINUTES } from "./constants";
import { getThresholdPace } from "./paceTable";

/**
 * Compute the plan's Monday-based week context.
 * Single source of truth for week index calculation — used by
 * VolumeTrendChart, IntelScreen, and usePhaseInfo.
 */
export function getPlanWeekContext(raceDate: string, totalWeeks: number) {
  const rDate = parseISO(raceDate);
  const raceWeekMonday = startOfWeek(rDate, { weekStartsOn: 1 });
  const planStartMonday = addWeeks(raceWeekMonday, -(totalWeeks - 1));
  const today = new Date();
  const currentWeekIdx = differenceInCalendarWeeks(today, planStartMonday, { weekStartsOn: 1 });

  return { planStartMonday, currentWeekIdx };
}

/** Get the week index for a given date within the plan. */
export function getWeekIdx(date: Date, planStartMonday: Date): number {
  return differenceInCalendarWeeks(date, planStartMonday, { weekStartsOn: 1 });
}

export interface WorkoutEstimationContext {
  paceTable?: PaceTable;
  thresholdPace?: number;
}

export interface WorkoutMetricDuration {
  minutes: number;
  estimated: boolean;
}

export interface WorkoutMetricDistance {
  km: number;
  estimated: boolean;
}

export interface ResolvedWorkoutMetrics {
  duration: WorkoutMetricDuration | null;
  distance: WorkoutMetricDistance | null;
  prescribedCarbsG: number | null;
  segments: WorkoutSegment[];
}

interface WorkoutEstimationOptions extends WorkoutEstimationContext {
  currentAbilityDist?: number;
  currentAbilitySecs?: number;
}

function isPaceTableLike(
  value: WorkoutEstimationContext | PaceTable | undefined,
): value is PaceTable {
  if (!value || typeof value !== "object") return false;
  if ("paceTable" in value || "thresholdPace" in value) return false;
  return "z1" in value || "z2" in value || "z3" in value || "z4" in value || "z5" in value;
}

export function createWorkoutEstimationContext(
  options: WorkoutEstimationOptions = {},
): WorkoutEstimationContext {
  const thresholdPace = options.thresholdPace
    ?? getThresholdPace(options.currentAbilityDist, options.currentAbilitySecs);
  return {
    paceTable: options.paceTable,
    thresholdPace,
  };
}

export function normalizeWorkoutEstimationContext(
  contextOrPaceTable?: WorkoutEstimationContext | PaceTable,
  thresholdPace?: number,
): WorkoutEstimationContext {
  if (isPaceTableLike(contextOrPaceTable)) {
    return createWorkoutEstimationContext({
      paceTable: contextOrPaceTable,
      thresholdPace,
    });
  }
  if (contextOrPaceTable) return contextOrPaceTable;
  return createWorkoutEstimationContext({ thresholdPace });
}

function resolveWorkoutDuration(segments: WorkoutSegment[]): WorkoutMetricDuration | null {
  if (segments.length === 0) return null;
  const total = segments.reduce((sum, segment) => sum + segment.duration, 0);
  if (total <= 0) return null;
  return {
    minutes: Math.round(total),
    estimated: segments.some((segment) => segment.estimated),
  };
}

function resolveWorkoutDistance(
  segments: WorkoutSegment[],
  context: WorkoutEstimationContext,
): WorkoutMetricDistance | null {
  if (segments.length === 0) return null;

  let totalKm = 0;
  let hasTimeBasedSegment = false;

  for (const segment of segments) {
    if (segment.km != null) {
      totalKm += segment.km;
      continue;
    }
    if (segment.noPace) continue;

    hasTimeBasedSegment = true;
    totalKm += segment.duration / paceForIntensity(segment.intensity, context.paceTable);
  }

  if (totalKm <= 0) return null;
  return {
    km: Math.round(totalKm * 10) / 10,
    estimated: hasTimeBasedSegment,
  };
}

export function resolveWorkoutMetrics(
  description: string | undefined,
  fuelRateGPerHour?: number | null,
  context: WorkoutEstimationContext = {},
): ResolvedWorkoutMetrics {
  if (!description) {
    return {
      duration: null,
      distance: null,
      prescribedCarbsG: null,
      segments: [],
    };
  }

  const segments = parseWorkoutSegments(
    description,
    context.paceTable,
    context.thresholdPace,
  );
  const duration = resolveWorkoutDuration(segments);
  const distance = resolveWorkoutDistance(segments, context);

  return {
    duration,
    distance,
    prescribedCarbsG: duration && fuelRateGPerHour != null
      ? calculateWorkoutCarbs(duration.minutes, fuelRateGPerHour)
      : null,
    segments,
  };
}

export function getEstimatedDuration(event: WorkoutEvent): number {
  if (event.distance) return event.distance * 6;
  if (event.name.includes("Long")) {
    const match = /(\d+)km/.exec(event.name);
    if (match) return parseInt(match[1], 10) * 6;
  }
  return DEFAULT_WORKOUT_DURATION_MINUTES;
}

export function estimateWorkoutDuration(description: string, paceTable?: PaceTable, thresholdPace?: number): { minutes: number; estimated: boolean } | null {
  return resolveWorkoutMetrics(
    description,
    null,
    normalizeWorkoutEstimationContext(paceTable, thresholdPace),
  ).duration;
}

/** Estimate total distance (km) from a workout description. Returns exact km for distance-based workouts, estimated for time-based. */
export function estimateWorkoutDescriptionDistance(description: string, paceTable?: PaceTable, thresholdPace?: number): { km: number; estimated: boolean } | null {
  return resolveWorkoutMetrics(
    description,
    null,
    normalizeWorkoutEstimationContext(paceTable, thresholdPace),
  ).distance;
}

export function calculateWorkoutCarbs(
  durationMinutes: number,
  fuelRateGPerHour: number,
): number {
  return Math.round((durationMinutes / 60) * fuelRateGPerHour);
}

/** Compute prescribed carbs (g) for a workout. Description is the prescription —
 *  never derive from any actual run time (event.duration / moving_time / elapsed_time
 *  get overwritten with the paired activity's actual time after pairing).
 *
 *  paceTable + thresholdPace are required to get an accurate duration for absolute-pace
 *  prescriptions with wide ranges (e.g. easy z2 with the walking-pace floor) — without
 *  them the literal pace midpoint of "6:27-18:54/km" is taken at face value and the
 *  carb total ends up 2x too high. Callers should always pass them when available. */
export function prescribedCarbs(
  description: string | undefined,
  fuelRateGPerHour: number | null | undefined,
  paceTable?: PaceTable,
  thresholdPace?: number,
): number | null {
  return resolveWorkoutMetrics(
    description,
    fuelRateGPerHour,
    normalizeWorkoutEstimationContext(paceTable, thresholdPace),
  ).prescribedCarbsG;
}

export function estimateWorkoutDistance(event: CalendarEvent, paceTable?: PaceTable, thresholdPace?: number): number {
  const context = normalizeWorkoutEstimationContext(paceTable, thresholdPace);
  if (event.distance) {
    return event.distance / 1000;
  }
  const kmMatch = /\((\d+)km\)/.exec(event.name);
  if (kmMatch) return parseInt(kmMatch[1], 10);

  const resolved = resolveWorkoutMetrics(event.description, event.fuelRate, context);
  if (resolved.distance) return resolved.distance.km;

  const pace = event.category === "interval"
    ? paceForIntensity(90, context.paceTable)
    : paceForIntensity(70, context.paceTable);

  if (resolved.duration) return resolved.duration.minutes / pace;

  if (event.duration) return event.duration / 60 / pace;

  return 0;
}

/** Estimate distance (km) from a generated WorkoutEvent (no activity data). */
export function estimatePlanEventDistance(event: WorkoutEvent, paceTable?: PaceTable, thresholdPace?: number): number {
  const context = normalizeWorkoutEstimationContext(paceTable, thresholdPace);
  if (event.distance) return event.distance;
  const kmMatch = /\((\d+)km\)/.exec(event.name);
  if (kmMatch) return parseInt(kmMatch[1], 10);

  const resolved = resolveWorkoutMetrics(event.description, event.fuelRate, context);
  if (resolved.distance) return resolved.distance.km;

  const isInterval = /interval|hills|short|long intervals|distance intervals|race pace/i.test(event.name);
  const pace = paceForIntensity(isInterval ? 90 : 70, context.paceTable);
  if (resolved.duration) return resolved.duration.minutes / pace;
  return 0;
}
