import { differenceInDays, formatISO } from "date-fns";
import type { CalendarEvent } from "./types";

export interface LongestRun {
  distanceKm: number;
  name: string;
  dateISO: string;     // yyyy-mm-dd
  activityId?: string;
}

export interface RunVolumeStats {
  runs7d: number;
  runs28d: number;
}

export function getLongestRun(events: CalendarEvent[]): LongestRun | null {
  const completed = events.filter(
    (e): e is CalendarEvent & { distance: number } =>
      e.type === "completed" && typeof e.distance === "number" && e.distance > 0
  );

  if (completed.length === 0) return null;

  const longest = completed.reduce((max, e) =>
    (e.distance > max.distance ? e : max)
  );

  return {
    distanceKm: longest.distance / 1000,
    name: longest.name,
    dateISO: formatISO(longest.date, { representation: "date" }),
    activityId: longest.activityId,
  };
}

export function getRunVolumeStats(events: CalendarEvent[], reference: Date): RunVolumeStats {
  const completed = events.filter((e) => e.type === "completed" && e.date <= reference);

  const runs7d = completed.filter((e) => {
    const diff = differenceInDays(reference, e.date);
    return diff <= 7;
  }).length;

  const runs28d = completed.filter((e) => {
    const diff = differenceInDays(reference, e.date);
    return diff <= 28;
  }).length;

  return { runs7d, runs28d };
}

export function getEarliestRunDate(events: CalendarEvent[]): string | null {
  const completed = events.filter((e) => e.type === "completed");

  if (completed.length === 0) return null;

  const earliest = completed.reduce((min, e) =>
    (e.date < min.date ? e : min)
  );

  return formatISO(earliest.date, { representation: "date" });
}
