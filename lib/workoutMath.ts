import type { CalendarEvent, WorkoutEvent, PaceTable } from "./types";
import { parseWorkoutSegments, paceForIntensity } from "./descriptionParser";
import { DEFAULT_WORKOUT_DURATION_MINUTES } from "./constants";

export function getEstimatedDuration(event: WorkoutEvent): number {
  if (event.name.includes("Long")) {
    const match = event.name.match(/(\d+)km/);
    if (match) return parseInt(match[1], 10) * 6;
  }
  return DEFAULT_WORKOUT_DURATION_MINUTES;
}

export function estimateWorkoutDuration(description: string, paceTable?: PaceTable): { minutes: number; estimated: boolean } | null {
  const segments = parseWorkoutSegments(description, paceTable);
  if (segments.length === 0) return null;
  const total = segments.reduce((sum, s) => sum + s.duration, 0);
  if (total <= 0) return null;
  const estimated = segments.some((s) => s.estimated);
  return { minutes: Math.round(total), estimated };
}

/** Estimate total distance (km) from a workout description. Returns exact km for distance-based workouts, estimated for time-based. */
export function estimateWorkoutDescriptionDistance(description: string, paceTable?: PaceTable): { km: number; estimated: boolean } | null {
  const segments = parseWorkoutSegments(description, paceTable);
  if (segments.length === 0) return null;
  let totalKm = 0;
  let hasTimeBasedSegment = false;
  for (const seg of segments) {
    if (seg.km != null) {
      totalKm += seg.km;
    } else {
      hasTimeBasedSegment = true;
      totalKm += seg.duration / paceForIntensity(seg.intensity, paceTable);
    }
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

export function estimateWorkoutDistance(event: CalendarEvent, paceTable?: PaceTable): number {
  if (event.distance) {
    return event.distance / 1000;
  }
  const kmMatch = event.name.match(/\((\d+)km\)/);
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
  const kmMatch = event.name.match(/\((\d+)km\)/);
  if (kmMatch) return parseInt(kmMatch[1], 10);

  const isInterval = /interval|hills|short|long intervals|distance intervals|race pace/i.test(event.name);
  const pace = paceForIntensity(isInterval ? 90 : 70, paceTable);
  const parsed = estimateWorkoutDuration(event.description, paceTable);
  if (parsed) return parsed.minutes / pace;
  return 0;
}
