import { format, addDays, differenceInDays, parseISO } from "date-fns";
import type {
  WorkoutEvent,
  IntervalsStream,
  IntervalsEvent,
  HRZoneData,
  StreamData,
  CalendarEvent,
  IntervalsActivity,
} from "./types";
import { API_BASE, DEFAULT_LTHR } from "./constants";
import { convertGlucoseToMmol, getWorkoutCategory, extractFuelRate, extractTotalCarbs, calculateWorkoutCarbs, estimateWorkoutDuration } from "./utils";

export const authHeader = (apiKey: string) => "Basic " + btoa("API_KEY:" + apiKey);

/** Resolve fuel rate (g/h): prefer carbs_per_hour API field, fall back to description regex. */
function resolveFuelRate(carbsPerHour: number | null | undefined, description: string): number | null {
  return carbsPerHour ?? extractFuelRate(description);
}

// --- STREAM FETCHING ---

const RETRY_DELAYS = [1000, 2000, 4000]; // ms — backoff for 429s

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchStreams(
  activityId: string,
  apiKey: string,
): Promise<IntervalsStream[]> {
  const auth = authHeader(apiKey);
  const keys = [
    "time",
    "heartrate",
    "bloodglucose",
    "glucose",
    "ga_smooth",
    "velocity_smooth",
    "cadence",
    "altitude",
  ].join(",");
  const url = `${API_BASE}/activity/${activityId}/streams?keys=${keys}`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (res.ok) {
        return await res.json();
      }
      if (res.status === 429 && attempt < RETRY_DELAYS.length) {
        console.warn(`Rate limited on activity ${activityId}, retrying in ${RETRY_DELAYS[attempt]}ms...`);
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      console.warn(
        `Failed to fetch streams for activity ${activityId}: ${res.status} ${res.statusText}`,
      );
      return [];
    } catch (e) {
      if (attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      console.warn(`Error fetching streams for activity ${activityId}:`, e);
      return [];
    }
  }
  return [];
}

// --- BATCH STREAM FETCHING ---

const BATCH_DELAY_MS = 500; // pause between batches to avoid 429s

/** Fetch streams for multiple activities with concurrency control and rate limiting. */
export async function fetchStreamBatch(
  apiKey: string,
  activityIds: string[],
  concurrency: number = 2,
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, IntervalsStream[]>> {
  const results = new Map<string, IntervalsStream[]>();
  let completed = 0;

  for (let i = 0; i < activityIds.length; i += concurrency) {
    if (i > 0) await sleep(BATCH_DELAY_MS);

    const batch = activityIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        const streams = await fetchStreams(id, apiKey);
        return { id, streams };
      }),
    );

    for (const { id, streams } of batchResults) {
      results.set(id, streams);
      completed++;
    }

    onProgress?.(completed, activityIds.length);
  }

  return results;
}

// --- HR ZONE CALCULATION ---

function calculateHRZones(
  hrData: number[],
  lthr: number = DEFAULT_LTHR,
): HRZoneData {
  const zones: HRZoneData = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

  const z1Max = lthr * 0.66;
  const z2Max = lthr * 0.78;
  const z3Max = lthr * 0.89;
  const z4Max = lthr * 0.99;

  hrData.forEach((hr) => {
    if (hr <= z1Max) zones.z1++;
    else if (hr <= z2Max) zones.z2++;
    else if (hr <= z3Max) zones.z3++;
    else if (hr <= z4Max) zones.z4++;
    else zones.z5++;
  });

  return zones;
}

// --- ACTIVITY DETAILS ---

export async function fetchActivityDetails(
  activityId: string,
  apiKey: string,
  lthr: number = DEFAULT_LTHR,
): Promise<{
  hrZones?: HRZoneData;
  streamData?: StreamData;
  avgHr?: number;
  maxHr?: number;
}> {
  try {
    const streams = await fetchStreams(activityId, apiKey);

    let timeData: number[] = [];
    let hrData: number[] = [];
    let glucoseData: number[] = [];
    let velocityData: number[] = [];
    let cadenceData: number[] = [];
    let altitudeData: number[] = [];

    for (const s of streams) {
      if (s.type === "time") timeData = s.data;
      if (s.type === "heartrate") hrData = s.data;
      if (["bloodglucose", "glucose", "ga_smooth"].includes(s.type)) {
        glucoseData = s.data;
      }
      if (s.type === "velocity_smooth") {
        velocityData = s.data;
      }
      if (s.type === "cadence") cadenceData = s.data;
      if (s.type === "altitude") altitudeData = s.data;
    }

    const paceData = velocityData.map((v) => {
      if (v === 0 || v < 0.001) return null;
      const pace = 1000 / (v * 60);
      if (pace < 2.0 || pace > 12.0) return null;
      return pace;
    });

    const result: {
      hrZones?: HRZoneData;
      streamData?: StreamData;
      avgHr?: number;
      maxHr?: number;
    } = {};

    if (hrData.length > 0) {
      result.hrZones = calculateHRZones(hrData, lthr);
      result.avgHr = Math.round(
        hrData.reduce((a, b) => a + b, 0) / hrData.length,
      );
      result.maxHr = Math.round(Math.max(...hrData));
    }

    if (timeData.length > 0) {
      const streamData: StreamData = {};

      if (glucoseData.length > 0) {
        const glucoseInMmol = convertGlucoseToMmol(glucoseData);
        streamData.glucose = timeData.map((t, idx) => ({
          time: Math.round(t / 60),
          value: glucoseInMmol[idx],
        }));
      }

      if (hrData.length > 0) {
        streamData.heartrate = timeData.map((t, idx) => ({
          time: Math.round(t / 60),
          value: hrData[idx],
        }));
      }

      if (paceData.length > 0) {
        streamData.pace = timeData
          .map((t, idx) => ({
            time: Math.round(t / 60),
            value: paceData[idx],
          }))
          .filter(
            (point) => point.value !== null && point.value > 0,
          ) as { time: number; value: number }[];
      }

      if (cadenceData.length > 0) {
        streamData.cadence = timeData.map((t, idx) => ({
          time: Math.round(t / 60),
          value: cadenceData[idx] * 2,
        }));
      }

      if (altitudeData.length > 0) {
        streamData.altitude = timeData.map((t, idx) => ({
          time: Math.round(t / 60),
          value: altitudeData[idx],
        }));
      }

      if (Object.keys(streamData).length > 0) {
        result.streamData = streamData;
      }
    }

    return result;
  } catch (error) {
    console.error("Failed to fetch activity details:", error);
    return {};
  }
}

// --- CALENDAR API ---

// Deduplicate concurrent identical requests
const calendarInflight = new Map<string, Promise<CalendarEvent[]>>();

export async function fetchCalendarData(
  apiKey: string,
  startDate: Date,
  endDate: Date,
): Promise<CalendarEvent[]> {
  const oldest = format(startDate, "yyyy-MM-dd");
  const newest = format(endDate, "yyyy-MM-dd");
  const cacheKey = `${oldest}:${newest}`;

  const inflight = calendarInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = fetchCalendarDataInner(apiKey, oldest, newest).then(
    ({ events, autoPairs }) => {
      // Fire-and-forget: pair fallback-matched activities on Intervals.icu
      for (const { eventId, activityId } of autoPairs) {
        // Fire-and-forget pair on Intervals.icu
        pairEventWithActivity(apiKey, eventId, activityId).catch((err) =>
          console.warn(`Failed to auto-pair event ${eventId}:`, err),
        );
      }
      return events;
    },
  );
  calendarInflight.set(cacheKey, promise);
  promise.then(
    () => calendarInflight.delete(cacheKey),
    () => calendarInflight.delete(cacheKey),
  );
  return promise;
}

interface CalendarDataResult {
  events: CalendarEvent[];
  autoPairs: { eventId: number; activityId: string }[];
}

/** Convert completed run activities into CalendarEvents and track auto-pair candidates. */
function processActivities(
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

  // Build reverse lookup: activityId → planned event (authoritative link from Intervals.icu)
  const pairedEventMap = new Map<string, IntervalsEvent>();
  for (const event of events) {
    if (event.category === "WORKOUT" && event.paired_activity_id) {
      pairedEventMap.set(event.paired_activity_id, event);
    }
  }

  for (const activity of runActivities) {
    const category = getWorkoutCategory(activity.name);

    let pace: number | undefined;
    if (activity.distance && activity.moving_time) {
      const distanceKm = activity.distance / 1000;
      const durationMin = activity.moving_time / 60;
      pace = durationMin / distanceKm;
    }

    let hrZones: HRZoneData | undefined;
    if (
      activity.icu_hr_zone_times &&
      activity.icu_hr_zone_times.length >= 5
    ) {
      hrZones = {
        z1: activity.icu_hr_zone_times[0],
        z2: activity.icu_hr_zone_times[1],
        z3: activity.icu_hr_zone_times[2],
        z4: activity.icu_hr_zone_times[3],
        z5: activity.icu_hr_zone_times[4],
      };
    }

    const activityDate = parseISO(
      activity.start_date_local || activity.start_date,
    );

    // Prefer paired_activity_id (authoritative), fall back to ±3 day exact name match
    const authoritativeMatch = pairedEventMap.get(activity.id);
    const fallbackMatch = !authoritativeMatch ? events.find((event) => {
      if (event.category !== "WORKOUT") return false;
      if (event.paired_activity_id) return false; // already claimed by another activity
      const eventDate = parseISO(event.start_date_local);
      const withinWindow = Math.abs(differenceInDays(activityDate, eventDate)) <= 3;
      const actName = (activity.name ?? "").trim().toLowerCase();
      const evtName = (event.name ?? "").trim().toLowerCase();
      return withinWindow && actName === evtName;
    }) : undefined;
    const matchingEvent = authoritativeMatch ?? fallbackMatch;

    // Track fallback matches for auto-pairing on Intervals.icu
    if (fallbackMatch) {
      autoPairs.push({ eventId: fallbackMatch.id, activityId: activity.id });
      fallbackClaimedEventIds.add(fallbackMatch.id);
    }

    const description =
      matchingEvent?.description || activity.description || "";

    const fuelRate = resolveFuelRate(matchingEvent?.carbs_per_hour, description);

    // Calculate total carbs from fuel rate and duration
    let totalCarbs: number | null = null;
    if (fuelRate != null) {
      const durationMinutes = activity.moving_time ? activity.moving_time / 60 : null;
      if (durationMinutes != null) {
        totalCarbs = calculateWorkoutCarbs(durationMinutes, fuelRate);
      }
    }
    if (totalCarbs == null) {
      totalCarbs = extractTotalCarbs(description);
    }

    // Actual carbs ingested: from activity API field, default to planned totalCarbs
    const carbsIngested = activity.carbs_ingested ?? totalCarbs;

    const calendarEvent: CalendarEvent = {
      id: `activity-${activity.id}`,
      date: activityDate,
      name: activity.name,
      description,
      type: "completed",
      category,
      distance: activity.distance,
      duration: activity.moving_time,
      avgHr: activity.average_heartrate || activity.average_hr,
      maxHr: activity.max_heartrate || activity.max_hr,
      load: activity.icu_training_load,
      intensity: activity.icu_intensity,
      pace: activity.pace ? 1000 / (activity.pace * 60) : pace,
      calories: activity.calories,
      // Garmin reports half-cadence (steps per foot); double to get full SPM
      cadence: activity.average_cadence
        ? activity.average_cadence * 2
        : undefined,
      hrZones,
      fuelRate,
      totalCarbs,
      carbsIngested,
      activityId: activity.id,
    };

    activityMap.set(activity.id, calendarEvent);
    calendarEvents.push(calendarEvent);
  }

  return { calendarEvents, activityMap, autoPairs, fallbackClaimedEventIds };
}

/** Convert planned/upcoming workout events into CalendarEvents (excluding already-completed ones). */
function processPlannedEvents(
  events: IntervalsEvent[],
  activityMap: Map<string, CalendarEvent>,
  fallbackClaimedEventIds: Set<number>,
): CalendarEvent[] {
  const calendarEvents: CalendarEvent[] = [];

  for (const event of events) {
    if (event.category !== "WORKOUT") continue;

    // Skip events already represented by a completed activity (paired or fallback-matched)
    if (fallbackClaimedEventIds.has(event.id)) continue;
    if (event.paired_activity_id && activityMap.has(event.paired_activity_id)) {
      continue;
    }

    const name = event.name || "";
    const eventDate = parseISO(event.start_date_local);
    const eventDesc = event.description || "";

    const isRace = name.toLowerCase().includes("race");
    const category = isRace ? "race" : getWorkoutCategory(name);

    const eventFuelRate = resolveFuelRate(event.carbs_per_hour, eventDesc);

    // Calculate total carbs from fuel rate and estimated duration.
    // Prefer our description-based estimate (uses our pace zones) over the
    // API's duration which Intervals.icu computes with its own pace config.
    let eventTotalCarbs: number | null = null;
    if (eventFuelRate != null) {
      const estDur = event.moving_time || event.duration || event.elapsed_time;
      const estMinutes = estimateWorkoutDuration(eventDesc)?.minutes ?? (estDur ? estDur / 60 : null);
      if (estMinutes != null) {
        eventTotalCarbs = calculateWorkoutCarbs(estMinutes, eventFuelRate);
      }
    }
    if (eventTotalCarbs == null) {
      eventTotalCarbs = extractTotalCarbs(eventDesc);
    }

    calendarEvents.push({
      id: `event-${event.id}`,
      date: eventDate,
      name,
      description: eventDesc,
      type: isRace ? "race" : "planned",
      category,
      distance: event.distance || 0,
      duration: event.moving_time || event.duration || event.elapsed_time,
      fuelRate: eventFuelRate,
      totalCarbs: eventTotalCarbs,
    });
  }

  return calendarEvents;
}

async function fetchCalendarDataInner(
  apiKey: string,
  oldest: string,
  newest: string,
): Promise<CalendarDataResult> {
  const auth = authHeader(apiKey);

  const [activitiesRes, eventsRes] = await Promise.all([
    fetch(
      `${API_BASE}/athlete/0/activities?oldest=${oldest}&newest=${newest}&cols=*`,
      { headers: { Authorization: auth } },
    ),
    fetch(`${API_BASE}/athlete/0/events?oldest=${oldest}&newest=${newest}`, {
      headers: { Authorization: auth },
    }),
  ]);

  if (!activitiesRes.ok) {
    throw new Error(`Failed to fetch activities: ${activitiesRes.status}`);
  }

  const activities: IntervalsActivity[] = await activitiesRes.json();
  const events: IntervalsEvent[] = eventsRes.ok ? await eventsRes.json() : [];

  const { calendarEvents, activityMap, autoPairs, fallbackClaimedEventIds } =
    processActivities(activities, events);

  const plannedEvents = processPlannedEvents(events, activityMap, fallbackClaimedEventIds);

  const allEvents = [...calendarEvents, ...plannedEvents];
  allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

  return { events: allEvents, autoPairs };
}

// --- EVENT PAIRING ---

export async function pairEventWithActivity(
  apiKey: string,
  eventId: number,
  activityId: string,
): Promise<void> {
  const auth = authHeader(apiKey);
  const res = await fetch(`${API_BASE}/athlete/0/events/${eventId}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ paired_activity_id: activityId }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to pair event ${eventId} with activity ${activityId}: ${res.status} ${errorText}`);
  }
}

// --- EVENT UPDATE ---

export async function updateEvent(
  apiKey: string,
  eventId: number,
  updates: { start_date_local?: string; name?: string; description?: string; carbs_per_hour?: number },
): Promise<void> {
  const auth = authHeader(apiKey);
  const res = await fetch(`${API_BASE}/athlete/0/events/${eventId}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to update event: ${res.status} ${errorText}`);
  }
}

// --- EVENT DELETE ---

export async function deleteEvent(
  apiKey: string,
  eventId: number,
): Promise<void> {
  const auth = authHeader(apiKey);
  const res = await fetch(`${API_BASE}/athlete/0/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to delete event: ${res.status} ${errorText}`);
  }
}

export async function deleteActivity(
  apiKey: string,
  activityId: string,
): Promise<void> {
  const auth = authHeader(apiKey);
  const res = await fetch(`${API_BASE}/activity/${activityId}`, {
    method: "DELETE",
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to delete activity: ${res.status} ${errorText}`);
  }
}

// --- API UPLOAD ---

export async function uploadToIntervals(
  apiKey: string,
  events: WorkoutEvent[],
): Promise<number> {
  const auth = authHeader(apiKey);
  const todayStr = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss");
  const endStr = format(addDays(new Date(), 365), "yyyy-MM-dd'T'HH:mm:ss");

  try {
    const deleteRes = await fetch(
      `${API_BASE}/athlete/0/events?oldest=${todayStr}&newest=${endStr}&category=WORKOUT`,
      {
        method: "DELETE",
        headers: { Authorization: auth },
      },
    );

    if (!deleteRes.ok) {
      console.error(`Delete failed with status ${deleteRes.status}`);
    }
  } catch (deleteError) {
    console.error("Error during deletion phase:", deleteError);
  }

  const payload = events.map((e) => ({
    category: "WORKOUT",
    start_date_local: format(e.start_date_local, "yyyy-MM-dd'T'HH:mm:ss"),
    name: e.name,
    description: e.description,
    external_id: e.external_id,
    type: e.type,
    ...(e.fuelRate != null && { carbs_per_hour: Math.round(e.fuelRate) }),
  }));

  try {
    const res = await fetch(`${API_BASE}/athlete/0/events/bulk?upsert=true`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API Error ${res.status}: ${errorText}`);
    }
    return payload.length;
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
}

/**
 * Upsert events without deleting existing ones.
 * Uses external_id for matching — existing events with same external_id are updated, new ones created.
 */
export async function upsertEvents(
  apiKey: string,
  events: WorkoutEvent[],
): Promise<number> {
  const auth = authHeader(apiKey);

  const payload = events.map((e) => ({
    category: "WORKOUT",
    start_date_local: format(e.start_date_local, "yyyy-MM-dd'T'HH:mm:ss"),
    name: e.name,
    description: e.description,
    external_id: e.external_id,
    type: e.type,
    ...(e.fuelRate != null && { carbs_per_hour: Math.round(e.fuelRate) }),
  }));

  const res = await fetch(`${API_BASE}/athlete/0/events/bulk?upsert=true`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error ${res.status}: ${errorText}`);
  }
  return payload.length;
}

export async function updateActivityCarbs(
  apiKey: string,
  activityId: string,
  carbsIngested: number,
): Promise<void> {
  const auth = authHeader(apiKey);
  const res = await fetch(`${API_BASE}/activity/${activityId}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ carbs_ingested: carbsIngested }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to update activity carbs: ${res.status} ${errorText}`);
  }
}
