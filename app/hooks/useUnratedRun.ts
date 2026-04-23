"use client";

import type { CalendarEvent } from "@/lib/types";

interface UnratedRun {
  activityId: string;
  name: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Detect the most recent completed run (last 7 days) that hasn't been rated.
 * Pure client-side — filters directly from CalendarEvent.rating field.
 */
export function useUnratedRun(events: CalendarEvent[]): UnratedRun | null {
  const cutoff = Date.now() - SEVEN_DAYS_MS;

  const mostRecent = events
    .filter(
      (e): e is CalendarEvent & { activityId: string } =>
        e.type === "completed" &&
        typeof e.activityId === "string" &&
        !e.rating &&
        e.date.getTime() >= cutoff,
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .at(0);

  return mostRecent
    ? { activityId: mostRecent.activityId, name: mostRecent.name }
    : null;
}
