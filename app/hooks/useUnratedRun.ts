"use client";

import type { CalendarEvent } from "@/lib/types";

interface UnratedRun {
  activityId: string;
  name: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isUnratedCompletedRun(event: CalendarEvent): event is CalendarEvent & { activityId: string } {
  return event.type === "completed"
    && typeof event.activityId === "string"
    && !event.rating;
}

/**
 * Detect the most recent completed run (last 7 days) that hasn't been rated.
 * Pure client-side — filters directly from CalendarEvent.rating field.
 */
export function useUnratedRun(events: CalendarEvent[], now = Date.now()): UnratedRun | null {
  const cutoff = now - SEVEN_DAYS_MS;

  const mostRecent = events
    .filter(
      (event): event is CalendarEvent & { activityId: string } =>
        isUnratedCompletedRun(event) && event.date.getTime() >= cutoff,
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .at(0);

  return mostRecent
    ? { activityId: mostRecent.activityId, name: mostRecent.name }
    : null;
}

export function getNextUnratedRunBoundary(
  events: CalendarEvent[],
  now = Date.now(),
): number | null {
  const nextExpiry = events
    .filter(isUnratedCompletedRun)
    .map((event) => event.date.getTime() + SEVEN_DAYS_MS)
    .filter((expiry) => expiry > now)
    .sort((left, right) => left - right)
    .at(0);

  return nextExpiry ?? null;
}
