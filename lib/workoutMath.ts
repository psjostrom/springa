import {
  startOfWeek,
  addWeeks,
  differenceInCalendarWeeks,
  parseISO,
} from "date-fns";
import type { CalendarEvent, WorkoutEvent, PaceTable } from "./types";
import { parseWorkoutSegments, paceForIntensity } from "./descriptionParser";
import { DEFAULT_WORKOUT_DURATION_MINUTES } from "./constants";

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

export function getEstimatedDuration(event: WorkoutEvent): number {
  if (event.distance) return event.distance * 6;
  if (event.name.includes("Long")) {
    const match = /(\d+)km/.exec(event.name);
    if (match) return parseInt(match[1], 10) * 6;
  }
  return DEFAULT_WORKOUT_DURATION_MINUTES;
}

export function estimateWorkoutDuration(description: string, paceTable?: PaceTable, thresholdPace?: number): { minutes: number; estimated: boolean } | null {
  const segments = parseWorkoutSegments(description, paceTable, thresholdPace);
  if (segments.length === 0) return null;
  const total = segments.reduce((sum, s) => sum + s.duration, 0);
  if (total <= 0) return null;
  const estimated = segments.some((s) => s.estimated);
  return { minutes: Math.round(total), estimated };
}

/** Estimate total distance (km) from a workout description. Returns exact km for distance-based workouts, estimated for time-based. */
export function estimateWorkoutDescriptionDistance(description: string, paceTable?: PaceTable, thresholdPace?: number): { km: number; estimated: boolean } | null {
  const segments = parseWorkoutSegments(description, paceTable, thresholdPace);
  if (segments.length === 0) return null;
  let totalKm = 0;
  let hasTimeBasedSegment = false;
  for (const seg of segments) {
    if (seg.km != null) {
      totalKm += seg.km;
    } else if (!seg.noPace) {
      hasTimeBasedSegment = true;
      totalKm += seg.duration / paceForIntensity(seg.intensity, paceTable);
    }
    // noPace segments contribute to duration only — we don't fake a distance from them.
  }
  if (totalKm <= 0) return null;
  return { km: Math.round(totalKm * 10) / 10, estimated: hasTimeBasedSegment };
}

export function calculateWorkoutCarbs(
  durationMinutes: number,
  fuelRateGPerHour: number,
): number {
  return Math.round((durationMinutes / 60) * fuelRateGPerHour);
}

/** Compute prescribed carbs (g) for a workout. Description is the prescription —
 *  never derive from any actual run time (event.duration / moving_time / elapsed_time
 *  get overwritten with the paired activity's actual time after pairing). */
export function prescribedCarbs(
  description: string | undefined,
  fuelRateGPerHour: number | null | undefined,
): number | null {
  if (!description || fuelRateGPerHour == null) return null;
  const parsed = estimateWorkoutDuration(description);
  if (!parsed) return null;
  return calculateWorkoutCarbs(parsed.minutes, fuelRateGPerHour);
}

export function estimateWorkoutDistance(event: CalendarEvent, paceTable?: PaceTable): number {
  if (event.distance) {
    return event.distance / 1000;
  }
  const kmMatch = /\((\d+)km\)/.exec(event.name);
  if (kmMatch) return parseInt(kmMatch[1], 10);

  const pace = event.category === "interval"
    ? paceForIntensity(90, paceTable)
    : paceForIntensity(70, paceTable);

  const parsed = estimateWorkoutDuration(event.description, paceTable);
  if (parsed) return parsed.minutes / pace;

  if (event.duration) return event.duration / 60 / pace;

  return 0;
}




/** Estimate distance (km) from a generated WorkoutEvent (no activity data). */
export function estimatePlanEventDistance(event: WorkoutEvent, paceTable?: PaceTable): number {
  if (event.distance) return event.distance;
  const kmMatch = /\((\d+)km\)/.exec(event.name);
  if (kmMatch) return parseInt(kmMatch[1], 10);

  const isInterval = /interval|hills|short|long intervals|distance intervals|race pace/i.test(event.name);
  const pace = paceForIntensity(isInterval ? 90 : 70, paceTable);
  const parsed = estimateWorkoutDuration(event.description, paceTable);
  if (parsed) return parsed.minutes / pace;
  return 0;
}
