import { format, addDays } from "date-fns";
import type {
  WorkoutEvent,
  IntervalsStream,
  IntervalsEvent,
  StreamData,
  CalendarEvent,
  IntervalsActivity,
} from "./types";
import { API_BASE } from "./constants";
import { convertGlucoseToMmol } from "./bgModel";
import { extractRawStreams } from "./streams";
import {
  processActivities,
  processPlannedEvents,
  type CalendarDataResult,
} from "./calendarPipeline";

export const authHeader = (apiKey: string) => "Basic " + btoa("API_KEY:" + apiKey);

// --- ATHLETE PROFILE ---

export async function fetchAthleteProfile(apiKey: string): Promise<{ lthr?: number; maxHr?: number; hrZones?: number[] }> {
  try {
    const res = await fetch(`${API_BASE}/athlete/0`, {
      headers: { Authorization: authHeader(apiKey) },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { sportSettings?: { types?: string[]; lthr?: number; max_hr?: number; hr_zones?: number[] }[] };
    // LTHR, max_hr, and hr_zones live inside sportSettings[], keyed by sport type
    const runSettings = Array.isArray(data.sportSettings)
      ? data.sportSettings.find((s) => s.types?.includes("Run"))
      : null;
    if (!runSettings) return {};
    const result: { lthr?: number; maxHr?: number; hrZones?: number[] } = {};
    if (typeof runSettings.lthr === "number" && runSettings.lthr > 0) result.lthr = runSettings.lthr;
    if (typeof runSettings.max_hr === "number" && runSettings.max_hr > 0) result.maxHr = runSettings.max_hr;
    if (Array.isArray(runSettings.hr_zones) && runSettings.hr_zones.length === 5) result.hrZones = runSettings.hr_zones;
    return result;
  } catch {
    return {};
  }
}

// --- ACTIVITY FETCHING ---

export async function fetchActivityById(
  apiKey: string,
  activityId: string,
): Promise<IntervalsActivity | null> {
  try {
    const res = await fetch(`${API_BASE}/activity/${activityId}`, {
      headers: { Authorization: authHeader(apiKey) },
    });
    if (!res.ok) return null;
    return (await res.json()) as IntervalsActivity;
  } catch {
    return null;
  }
}

export async function fetchActivitiesByDateRange(
  apiKey: string,
  oldest: string,
  newest: string,
): Promise<IntervalsActivity[]> {
  const res = await fetch(
    `${API_BASE}/athlete/0/activities?oldest=${oldest}&newest=${newest}&cols=*`,
    { headers: { Authorization: authHeader(apiKey) } },
  );
  if (!res.ok) return [];
  return (await res.json()) as IntervalsActivity[];
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
        return (await res.json()) as IntervalsStream[];
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
  concurrency = 2,
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

// --- ACTIVITY DETAILS ---

export async function fetchActivityDetails(
  activityId: string,
  apiKey: string,
): Promise<{
  streamData?: StreamData;
  avgHr?: number;
  maxHr?: number;
}> {
  try {
    const streams = await fetchStreams(activityId, apiKey);
    const { time: timeData, heartrate: hrData, glucose: glucoseData, velocity: velocityData, cadence: cadenceData, altitude: altitudeData } = extractRawStreams(streams);

    const paceData = velocityData.map((v) => {
      if (v === 0 || v < 0.001) return null;
      const pace = 1000 / (v * 60);
      if (pace < 2.0 || pace > 12.0) return null;
      return pace;
    });

    const result: {
      streamData?: StreamData;
      avgHr?: number;
      maxHr?: number;
    } = {};

    if (hrData.length > 0) {
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
      if (autoPairs.length > 0) console.log(`[auto-pair] ${autoPairs.length} fallback pairs to sync`);
      for (const { eventId, activityId } of autoPairs) {
        pairEventWithActivity(apiKey, eventId, activityId)
          .then(() => { console.log(`[auto-pair] SUCCESS paired event ${eventId} → activity ${activityId}`); })
          .catch((err: unknown) =>
            { console.warn(`[auto-pair] FAILED to pair event ${eventId} → activity ${activityId}:`, err); },
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

  const activities = (await activitiesRes.json()) as IntervalsActivity[];
  const events: IntervalsEvent[] = eventsRes.ok ? ((await eventsRes.json()) as IntervalsEvent[]) : [];

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
  // Intervals.icu ignores paired_activity_id on event PUT — pairing is set via the activity side
  const res = await fetch(`${API_BASE}/activity/${activityId}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ paired_event_id: eventId }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to pair activity ${activityId} with event ${eventId}: ${res.status} ${errorText}`);
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

// --- WELLNESS ---

export interface WellnessEntry {
  id: string; // date YYYY-MM-DD
  restingHR?: number;
  hrvRMSSD?: number;
  sleepSecs?: number;
  sleepScore?: number;
  spO2?: number;
  weight?: number;
  atl?: number;
  ctl?: number;
}

interface WellnessApiRow {
  id: string;
  restingHR?: number;
  hrv?: number; // Intervals.icu calls rMSSD "hrv"
  sleepSecs?: number;
  sleepScore?: number;
  spO2?: number;
  weight?: number;
  atl?: number;
  ctl?: number;
}

export async function fetchWellnessData(
  apiKey: string,
  oldest: string,
  newest: string,
): Promise<WellnessEntry[]> {
  try {
    const res = await fetch(
      `${API_BASE}/athlete/0/wellness?oldest=${oldest}&newest=${newest}`,
      { headers: { Authorization: authHeader(apiKey) } },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as WellnessApiRow[];
    return rows.map((r) => ({
      id: r.id,
      restingHR: r.restingHR,
      hrvRMSSD: r.hrv,
      sleepSecs: r.sleepSecs,
      sleepScore: r.sleepScore,
      spO2: r.spO2,
      weight: r.weight,
      atl: r.atl,
      ctl: r.ctl,
    }));
  } catch {
    return [];
  }
}

export async function updateActivityPreRunCarbs(
  apiKey: string,
  activityId: string,
  carbsG: number | null,
  minBefore: number | null,
): Promise<void> {
  const auth = authHeader(apiKey);
  const res = await fetch(`${API_BASE}/activity/${activityId}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ PreRunCarbsG: carbsG ?? 0, PreRunCarbsMin: minBefore ?? 0 }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to update pre-run carbs: ${res.status} ${errorText}`);
  }
}

export async function updateActivityFeedback(
  apiKey: string,
  activityId: string,
  rating: string,
  comment?: string,
): Promise<void> {
  const auth = authHeader(apiKey);
  const res = await fetch(`${API_BASE}/activity/${activityId}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ Rating: rating, FeedbackComment: comment ?? "" }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to update activity feedback: ${res.status} ${errorText}`);
  }
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
