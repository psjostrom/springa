import type { IntervalsActivity, IntervalsEvent } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface WorkoutEventMatchResult {
  matchingEvent: IntervalsEvent | undefined;
  fallbackMatch: IntervalsEvent | undefined;
  rejections: string[];
}

function normalizeName(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

function parseComparableDate(dateString: string | undefined): Date | null {
  if (!dateString) return null;
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(dateString)
    ? dateString
    : `${dateString}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseComparableDay(dateString: string | undefined): Date | null {
  const dateOnly = dateString?.slice(0, 10);
  if (!dateOnly) return null;
  return new Date(`${dateOnly}T00:00:00Z`);
}

export function findAuthoritativeWorkoutEventMatch(
  activity: IntervalsActivity,
  events: IntervalsEvent[],
  claimedEventIds: ReadonlySet<number> = new Set<number>(),
): IntervalsEvent | undefined {
  const workoutEvents = events.filter((event) => event.category === "WORKOUT");
  const eventById = new Map(workoutEvents.map((event) => [event.id, event]));

  const pairedEvent = workoutEvents.find(
    (event) => event.paired_activity_id === activity.id && !claimedEventIds.has(event.id),
  );
  if (pairedEvent) return pairedEvent;

  const claimedPairedEvent = activity.paired_event_id ? eventById.get(activity.paired_event_id) : undefined;
  if (claimedPairedEvent && !claimedEventIds.has(claimedPairedEvent.id)) return claimedPairedEvent;

  return undefined;
}

export function findWorkoutEventMatch(
  activity: IntervalsActivity,
  events: IntervalsEvent[],
  claimedEventIds: ReadonlySet<number> = new Set<number>(),
): WorkoutEventMatchResult {
  const workoutEvents = events.filter((event) => event.category === "WORKOUT");
  const authoritativeMatch = findAuthoritativeWorkoutEventMatch(activity, events, claimedEventIds);
  if (authoritativeMatch) {
    return {
      matchingEvent: authoritativeMatch,
      fallbackMatch: undefined,
      rejections: [],
    };
  }

  const activityName = normalizeName(activity.name);
  const activityStart = parseComparableDate(activity.start_date_local ?? activity.start_date);
  const activityDay = parseComparableDay(activity.start_date_local ?? activity.start_date);
  const rejections: string[] = [];

  const candidates = workoutEvents.flatMap((event) => {
    if (event.paired_activity_id) {
      rejections.push(`${event.id}|${event.name}|paired→${event.paired_activity_id}`);
      return [];
    }
    if (claimedEventIds.has(event.id)) {
      rejections.push(`${event.id}|${event.name}|claimed`);
      return [];
    }

    const eventName = normalizeName(event.name);
    const nameMatch = activityName === eventName || (eventName.length > 0 && activityName.endsWith(eventName));
    const eventDay = parseComparableDay(event.start_date_local);
    const dayDiff = activityDay && eventDay
      ? Math.abs(Math.round((activityDay.getTime() - eventDay.getTime()) / MS_PER_DAY))
      : Number.MAX_SAFE_INTEGER;
    const withinWindow = dayDiff <= 3;

    if (!withinWindow) {
      rejections.push(`${event.id}|${event.name}|dayDiff=${dayDiff}`);
      return [];
    }
    if (!nameMatch) {
      rejections.push(`${event.id}|${event.name}|name≠"${activityName}"`);
      return [];
    }

    const eventStart = parseComparableDate(event.start_date_local);
    const timeDiff = activityStart && eventStart
      ? Math.abs(activityStart.getTime() - eventStart.getTime())
      : Number.MAX_SAFE_INTEGER;

    return [{ event, dayDiff, timeDiff }];
  });

  candidates.sort((left, right) => {
    if (left.dayDiff !== right.dayDiff) return left.dayDiff - right.dayDiff;
    if (left.timeDiff !== right.timeDiff) return left.timeDiff - right.timeDiff;
    return left.event.id - right.event.id;
  });

  return {
    matchingEvent: candidates[0]?.event,
    fallbackMatch: candidates[0]?.event,
    rejections,
  };
}