import { differenceInDays, parseISO } from "date-fns";
import type {
  IntervalsEvent,
  HRZoneData,
  CalendarEvent,
  IntervalsActivity,
} from "./types";
import { getWorkoutCategory } from "./constants";
import { calculateWorkoutCarbs, estimatePlannedMinutes } from "./workoutMath";
import { nonEmpty } from "./format";
import { categoryFromExternalId } from "./paceInsight";

/** Intervals.icu custom fields can't be null — 0 means "not set". */
function nonZero(v: number | undefined): number | null {
  if (v === undefined || v === 0) return null;
  return v;
}

export interface CalendarDataResult {
  events: CalendarEvent[];
  autoPairs: { eventId: number; activityId: string }[];
}

/** Convert a single IntervalsActivity to a CalendarEvent (no event pairing). */
export function activityToCalendarEvent(activity: IntervalsActivity): CalendarEvent {
  const category = getWorkoutCategory(activity.name);

  let pace: number | undefined;
  if (activity.distance && activity.moving_time) {
    const distanceKm = activity.distance / 1000;
    const durationMin = activity.moving_time / 60;
    pace = durationMin / distanceKm;
  }

  let zoneTimes: HRZoneData | undefined;
  if (activity.icu_hr_zone_times && activity.icu_hr_zone_times.length >= 5) {
    zoneTimes = {
      z1: activity.icu_hr_zone_times[0],
      z2: activity.icu_hr_zone_times[1],
      z3: activity.icu_hr_zone_times[2],
      z4: activity.icu_hr_zone_times[3],
      z5: activity.icu_hr_zone_times[4],
    };
  }

  const activityDate = parseISO(activity.start_date);

  return {
    id: `activity-${activity.id}`,
    date: activityDate,
    name: activity.name,
    description: activity.description ?? "",
    type: "completed",
    category,
    distance: activity.distance,
    duration: activity.moving_time,
    avgHr: activity.average_heartrate ?? activity.average_hr,
    maxHr: activity.max_heartrate ?? activity.max_hr,
    load: activity.icu_training_load,
    intensity: activity.icu_intensity,
    pace: activity.pace ? 1000 / (activity.pace * 60) : pace,
    calories: activity.calories,
    cadence: activity.average_cadence ? activity.average_cadence * 2 : undefined,
    zoneTimes,
    fuelRate: null,
    totalCarbs: null,
    carbsIngested: activity.carbs_ingested ?? null,
    preRunCarbsG: nonZero(activity.PreRunCarbsG),
    rating: nonEmpty(activity.Rating),
    feedbackComment: nonEmpty(activity.FeedbackComment),
    activityId: activity.id,
  };
}

/** Convert completed run activities into CalendarEvents and track auto-pair candidates. */
export function processActivities(
  activities: IntervalsActivity[],
  events: IntervalsEvent[],
): {
  calendarEvents: CalendarEvent[];
  activityMap: Map<string, CalendarEvent>;
  autoPairs: { eventId: number; activityId: string }[];
  fallbackClaimedEventIds: Set<number>;
} {
  const calendarEvents: CalendarEvent[] = [];
  const autoPairs: { eventId: number; activityId: string }[] = [];
  const fallbackClaimedEventIds = new Set<number>();
  const activityMap = new Map<string, CalendarEvent>();

  const runActivities = activities.filter(
    (a) => a.type === "Run" || a.type === "VirtualRun",
  );

  console.log(`[auto-pair] ${runActivities.length} run activities, ${events.length} events`);

  // Build reverse lookups for authoritative pairing (both directions)
  const pairedEventMap = new Map<string, IntervalsEvent>();
  const eventById = new Map<number, IntervalsEvent>();
  for (const event of events) {
    if (event.category === "WORKOUT") {
      eventById.set(event.id, event);
      if (event.paired_activity_id) {
        pairedEventMap.set(event.paired_activity_id, event);
      }
    }
  }

  for (const activity of runActivities) {
    let pace: number | undefined;
    if (activity.distance && activity.moving_time) {
      const distanceKm = activity.distance / 1000;
      const durationMin = activity.moving_time / 60;
      pace = durationMin / distanceKm;
    }

    let zoneTimes: HRZoneData | undefined;
    if (
      activity.icu_hr_zone_times &&
      activity.icu_hr_zone_times.length >= 5
    ) {
      zoneTimes = {
        z1: activity.icu_hr_zone_times[0],
        z2: activity.icu_hr_zone_times[1],
        z3: activity.icu_hr_zone_times[2],
        z4: activity.icu_hr_zone_times[3],
        z5: activity.icu_hr_zone_times[4],
      };
    }

    // Prefer start_date (UTC, has Z suffix) — timezone-safe on any server.
    // start_date_local has no timezone suffix and would be parsed as server-local
    // time, which is wrong on Vercel (UTC) for CET users.
    const activityDate = parseISO(activity.start_date);

    // Prefer authoritative link (either direction), fall back to ±3 day exact name match
    const authoritativeMatch = pairedEventMap.get(activity.id)
      ?? (activity.paired_event_id ? eventById.get(activity.paired_event_id) : undefined);

    const rejections: string[] = [];
    const fallbackMatch = !authoritativeMatch ? events.find((event) => {
      if (event.category !== "WORKOUT") return false;
      const actName = activity.name.trim().toLowerCase();
      const evtName = (event.name ?? "").trim().toLowerCase();
      if (event.paired_activity_id) {
        rejections.push(`${event.id}|${event.name}|paired→${event.paired_activity_id}`);
        return false;
      }
      if (fallbackClaimedEventIds.has(event.id)) {
        rejections.push(`${event.id}|${event.name}|claimed`);
        return false;
      }
      const eventDate = parseISO(event.start_date_local);
      const dayDiff = Math.abs(differenceInDays(activityDate, eventDate));
      const withinWindow = dayDiff <= 3;
      const nameMatch = actName === evtName || (evtName.length > 0 && actName.endsWith(evtName));
      if (!withinWindow) {
        rejections.push(`${event.id}|${event.name}|dayDiff=${dayDiff}`);
      } else if (!nameMatch) {
        rejections.push(`${event.id}|${event.name}|name≠"${actName}"`);
      }
      return withinWindow && nameMatch;
    }) : undefined;
    const matchingEvent = authoritativeMatch ?? fallbackMatch;

    // Log: fallback match → one line; plan workout with no match → detail block; otherwise silent
    if (fallbackMatch) {
      console.log(`[auto-pair] fallback: activity "${activity.name}" → event ${fallbackMatch.id}`);
    } else if (!matchingEvent && /^(W\d{2}\b|RACE\s+DAY)/i.test(activity.name)) {
      console.log(`[auto-pair] UNMATCHED activity ${activity.id} "${activity.name}" (${activity.start_date_local})`);
      for (const r of rejections) console.log(`[auto-pair]   rejected: ${r}`);
    }

    // Track fallback matches for auto-pairing on Intervals.icu
    if (fallbackMatch) {
      autoPairs.push({ eventId: fallbackMatch.id, activityId: activity.id });
      fallbackClaimedEventIds.add(fallbackMatch.id);
    } else if (matchingEvent) {
      // Authoritative match — claim the event so processPlannedEvents skips it
      fallbackClaimedEventIds.add(matchingEvent.id);
    }

    const description =
      matchingEvent?.description ?? activity.description ?? "";

    const fuelRate = matchingEvent?.carbs_per_hour ?? null;

    // Calculate total carbs from fuel rate and PLANNED duration.
    let totalCarbs: number | null = null;
    if (fuelRate != null) {
      const eventDur = matchingEvent?.duration ?? matchingEvent?.elapsed_time ?? matchingEvent?.moving_time;
      const estMinutes = estimatePlannedMinutes(description, eventDur, activity.moving_time);
      if (estMinutes != null) {
        totalCarbs = calculateWorkoutCarbs(estMinutes, fuelRate);
      }
    }

    // Actual carbs ingested: from activity API field, default to planned totalCarbs
    const carbsIngested = activity.carbs_ingested ?? totalCarbs;

    const category = categoryFromExternalId(matchingEvent?.external_id) ?? getWorkoutCategory(activity.name);

    const calendarEvent: CalendarEvent = {
      id: `activity-${activity.id}`,
      date: activityDate,
      name: activity.name,
      description,
      type: "completed",
      category,
      distance: activity.distance,
      duration: activity.moving_time,
      avgHr: activity.average_heartrate ?? activity.average_hr,
      maxHr: activity.max_heartrate ?? activity.max_hr,
      load: activity.icu_training_load,
      intensity: activity.icu_intensity,
      pace: activity.pace ? 1000 / (activity.pace * 60) : pace,
      calories: activity.calories,
      // Garmin reports half-cadence (steps per foot); double to get full SPM
      cadence: activity.average_cadence
        ? activity.average_cadence * 2
        : undefined,
      zoneTimes,
      fuelRate,
      totalCarbs,
      carbsIngested,
      preRunCarbsG: nonZero(activity.PreRunCarbsG),
      rating: nonEmpty(activity.Rating),
      feedbackComment: nonEmpty(activity.FeedbackComment),
      activityId: activity.id,
      pairedEventId: matchingEvent?.id,
    };

    activityMap.set(activity.id, calendarEvent);
    calendarEvents.push(calendarEvent);
  }

  return { calendarEvents, activityMap, autoPairs, fallbackClaimedEventIds };
}

/** Convert planned/upcoming workout events into CalendarEvents (excluding already-completed ones). */
export function processPlannedEvents(
  events: IntervalsEvent[],
  activityMap: Map<string, CalendarEvent>,
  fallbackClaimedEventIds: Set<number>,
): CalendarEvent[] {
  const calendarEvents: CalendarEvent[] = [];

  for (const event of events) {
    if (event.category !== "WORKOUT") continue;

    // Skip events already represented by a completed activity (paired or fallback-matched)
    if (fallbackClaimedEventIds.has(event.id)) continue;
    if (event.paired_activity_id && activityMap.has(event.paired_activity_id)) continue;
    if (event.paired_activity_id && !activityMap.has(event.paired_activity_id)) {
      console.log(`[auto-pair] event ${event.id} "${event.name}" has paired_activity_id=${event.paired_activity_id} but activity not in activityMap`);
    }

    const name = event.name ?? "";
    const eventDate = parseISO(event.start_date_local);
    const eventDesc = event.description ?? "";

    const extCategory = categoryFromExternalId(event.external_id);
    const isRace = name.toLowerCase().includes("race");
    const category = extCategory ?? (isRace ? "race" : getWorkoutCategory(name));

    const eventFuelRate = event.carbs_per_hour ?? null;

    // Calculate total carbs from fuel rate and estimated duration.
    let eventTotalCarbs: number | null = null;
    if (eventFuelRate != null) {
      const eventDur = event.duration ?? event.elapsed_time ?? event.moving_time;
      const estMinutes = estimatePlannedMinutes(eventDesc, eventDur);
      if (estMinutes != null) {
        eventTotalCarbs = calculateWorkoutCarbs(estMinutes, eventFuelRate);
      }
    }

    calendarEvents.push({
      id: `event-${event.id}`,
      date: eventDate,
      name,
      description: eventDesc,
      type: isRace ? "race" : "planned",
      category,
      distance: event.distance ?? 0,
      duration: event.moving_time ?? event.duration ?? event.elapsed_time,
      fuelRate: eventFuelRate,
      totalCarbs: eventTotalCarbs,
    });
  }

  return calendarEvents;
}
