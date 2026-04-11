import { format, addDays } from "date-fns";
import type {
  WorkoutEvent,
  IntervalsStream,
  IntervalsEvent,
  StreamData,
  CalendarEvent,
  IntervalsActivity,
  PaceCurveData,
  BestEffort,
} from "./types";
import { API_BASE, PACE_ZONE_PCT, ZONE_DISPLAY_NAMES, type ZoneKey } from "./constants";
import { extractRawStreams, extractLatlng } from "./streams";
import {
  processActivities,
  processPlannedEvents,
  type CalendarDataResult,
} from "./calendarPipeline";

export const authHeader = (apiKey: string) => "Basic " + btoa("API_KEY:" + apiKey);

// --- ATHLETE PROFILE ---

// The Intervals.icu athlete response has 100+ fields across 14 platforms.
// Typing them all would be maintenance burden with no safety gain — we access specific fields by name.
type AthleteRaw = Record<string, unknown>;

export async function fetchAthleteRaw(apiKey: string): Promise<AthleteRaw | null> {
  try {
    const res = await fetch(`${API_BASE}/athlete/0`, {
      headers: { Authorization: authHeader(apiKey) },
    });
    if (!res.ok) return null;
    return (await res.json()) as AthleteRaw;
  } catch {
    return null;
  }
}

export async function fetchAthleteProfile(apiKey: string): Promise<{ lthr?: number; maxHr?: number; hrZones?: number[]; restingHr?: number; sportSettingsId?: number }> {
  const data = await fetchAthleteRaw(apiKey);
  if (!data) return {};
  const runSettings = Array.isArray(data.sportSettings)
    ? (data.sportSettings as { id?: number; types?: string[]; lthr?: number; max_hr?: number; hr_zones?: number[] }[]).find((s) => s.types?.includes("Run"))
    : null;
  if (!runSettings) return {};
  const result: { lthr?: number; maxHr?: number; hrZones?: number[]; restingHr?: number; sportSettingsId?: number } = {};
  if (typeof runSettings.lthr === "number" && runSettings.lthr > 0) result.lthr = runSettings.lthr;
  if (typeof runSettings.max_hr === "number" && runSettings.max_hr > 0) result.maxHr = runSettings.max_hr;
  if (Array.isArray(runSettings.hr_zones) && runSettings.hr_zones.length === 5) result.hrZones = runSettings.hr_zones;
  if (typeof data.icu_resting_hr === "number" && data.icu_resting_hr > 0) result.restingHr = data.icu_resting_hr;
  if (typeof runSettings.id === "number") result.sportSettingsId = runSettings.id;
  return result;
}

/**
 * Push HR zones and resting HR back to Intervals.icu so it remains the source of truth.
 */
export async function updateAthleteHRZones(
  apiKey: string,
  sportSettingsId: number,
  hrZones: number[],
  restingHr?: number,
): Promise<void> {
  // Update sport settings (hr_zones)
  const settingsUrl = new URL(`/api/v1/athlete/0/sport-settings/${encodeURIComponent(String(sportSettingsId))}`, "https://intervals.icu");
  await fetch(settingsUrl.href, {
    method: "PUT",
    headers: { Authorization: authHeader(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({ hr_zones: hrZones }),
  });
  // Update resting HR on athlete profile
  if (restingHr != null) {
    await fetch(`${API_BASE}/athlete/0`, {
      method: "PUT",
      headers: { Authorization: authHeader(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({ icu_resting_hr: restingHr }),
    });
  }
}

/** Update the threshold pace in Intervals.icu sport settings.
 *  Intervals.icu stores threshold_pace in m/s internally.
 *  This is used so that "% pace" in workout descriptions resolves to correct absolute paces.
 *  We set threshold = HM race pace (so 100% pace ≈ race effort). */
export async function updateThresholdPace(
  apiKey: string,
  sportSettingsId: number,
  paceMinPerKm: number,
): Promise<void> {
  // Convert min/km → m/s: 1 km/min ÷ pace × 1000m/km ÷ 60s/min
  const metersPerSecond = 1000 / (paceMinPerKm * 60);
  const settingsUrl = new URL(`/api/v1/athlete/0/sport-settings/${encodeURIComponent(String(sportSettingsId))}`, "https://intervals.icu");
  await fetch(settingsUrl.href, {
    method: "PUT",
    headers: { Authorization: authHeader(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({ threshold_pace: metersPerSecond }),
  });
}

/** Push pace zone boundaries and names to Intervals.icu sport settings.
 *  Derives from PACE_ZONE_PCT and ZONE_DISPLAY_NAMES (single source of truth).
 *  Format: array of zone ceilings as % of threshold speed, last value 999 (sentinel). */
export async function updatePaceZones(
  apiKey: string,
  sportSettingsId: number,
): Promise<void> {
  const paceZones = [...PACE_ZONE_PCT.map((pct) => Math.round(pct * 100)), 999];
  const zoneKeys: ZoneKey[] = ["z1", "z2", "z3", "z4", "z5"];
  const paceZoneNames = zoneKeys.map((k) => ZONE_DISPLAY_NAMES[k]);
  const settingsUrl = new URL(`/api/v1/athlete/0/sport-settings/${encodeURIComponent(String(sportSettingsId))}`, "https://intervals.icu");
  await fetch(settingsUrl.href, {
    method: "PUT",
    headers: { Authorization: authHeader(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({ pace_zones: paceZones, pace_zone_names: paceZoneNames }),
  });
}

export interface PlatformConnection {
  platform: "garmin" | "polar" | "suunto" | "coros" | "wahoo" | "amazfit" | "strava" | "huawei";
  linked: boolean;
  syncActivities: boolean;
  uploadWorkouts: boolean;
}

export interface ConnectionStatus {
  platforms: PlatformConnection[];
}

export async function fetchConnectionStatus(apiKey: string): Promise<ConnectionStatus> {
  const data = await fetchAthleteRaw(apiKey);
  if (!data) return { platforms: [] };

  const platforms: PlatformConnection[] = [
    {
      platform: "garmin",
      linked: data.icu_garmin_health === true,
      syncActivities: data.icu_garmin_health === true && data.icu_garmin_sync_activities === true,
      uploadWorkouts: data.icu_garmin_upload_workouts === true,
    },
    {
      platform: "polar",
      linked: data.polar_scope != null,
      syncActivities: data.polar_scope != null && data.polar_sync_activities === true,
      uploadWorkouts: false,
    },
    {
      platform: "suunto",
      linked: data.suunto_user_id != null,
      syncActivities: data.suunto_user_id != null && data.suunto_sync_activities === true,
      uploadWorkouts: data.suunto_upload_workouts === true,
    },
    {
      platform: "coros",
      linked: data.coros_user_id != null,
      syncActivities: data.coros_user_id != null && data.coros_sync_activities === true,
      uploadWorkouts: data.coros_upload_workouts === true,
    },
    {
      platform: "wahoo",
      linked: data.wahoo_user_id != null,
      syncActivities: data.wahoo_user_id != null && data.wahoo_sync_activities === true,
      uploadWorkouts: data.wahoo_upload_workouts === true,
    },
    {
      platform: "amazfit",
      linked: data.zepp_user_id != null,
      syncActivities: data.zepp_user_id != null && data.zepp_sync_activities === true,
      uploadWorkouts: data.zepp_upload_workouts === true,
    },
    {
      platform: "huawei",
      linked: data.huawei_user_id != null,
      syncActivities: data.huawei_user_id != null && data.huawei_sync_activities === true,
      uploadWorkouts: data.huawei_upload_workouts === true,
    },
    {
      platform: "strava",
      linked: data.strava_id != null,
      syncActivities: data.strava_id != null && data.strava_authorized === true,
      uploadWorkouts: false,
    },
  ];

  return { platforms };
}

// --- ACTIVITY FETCHING ---

export async function fetchActivityById(
  apiKey: string,
  activityId: string,
): Promise<IntervalsActivity | null> {
  try {
    const res = await fetch(`${API_BASE}/activity/${encodeURIComponent(activityId)}`, {
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
  // No longer fetching glucose streams - glucose comes from CGM
  const keys = [
    "time",
    "heartrate",
    "velocity_smooth",
    "cadence",
    "altitude",
    "distance",
    "latlng",
  ].join(",");
  const safeId = encodeURIComponent(activityId);
  const url = `${API_BASE}/activity/${safeId}/streams?keys=${keys}`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (res.ok) {
        return (await res.json()) as IntervalsStream[];
      }
      if (res.status === 429 && attempt < RETRY_DELAYS.length) {
        console.warn("Rate limited on activity", safeId, "retrying in", RETRY_DELAYS[attempt], "ms");
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      console.warn("Failed to fetch streams for activity", safeId, res.status, res.statusText);
      return [];
    } catch (e) {
      if (attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      console.warn("Error fetching streams for activity", safeId, e);
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
    const { time: timeData, heartrate: hrData, velocity: velocityData, cadence: cadenceData, altitude: altitudeData, distance: distanceData } = extractRawStreams(streams);

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

      // Glucose comes from CGM via activity_streams, not from streams

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

      if (distanceData.length > 0) {
        streamData.distance = distanceData;
        streamData.rawTime = timeData;
      }

      const latlng = extractLatlng(streams);
      if (latlng.length > 0) {
        streamData.latlng = latlng;
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

export async function fetchCalendarData(
  apiKey: string,
  startDate: Date,
  endDate: Date,
): Promise<CalendarEvent[]> {
  const oldest = format(startDate, "yyyy-MM-dd");
  const newest = format(endDate, "yyyy-MM-dd");

  const { events, autoPairs } = await fetchCalendarDataInner(apiKey, oldest, newest);

  // Fire-and-forget: don't block calendar load on pairing.
  // Pairing is best-effort - failures are logged but don't affect the user.
  // Next calendar fetch will retry any failed pairs via fallback matching.
  if (autoPairs.length > 0) console.log(`[auto-pair] ${autoPairs.length} fallback pairs to sync`);
  for (const { eventId, activityId } of autoPairs) {
    pairEventWithActivity(apiKey, eventId, activityId)
      .then(() => { console.log(`[auto-pair] SUCCESS paired event ${eventId} → activity ${activityId}`); })
      .catch((err: unknown) =>
        { console.warn(`[auto-pair] FAILED to pair event ${eventId} → activity ${activityId}:`, err); },
      );
  }

  return events;
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
  const res = await fetch(`${API_BASE}/activity/${encodeURIComponent(activityId)}`, {
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
  const res = await fetch(`${API_BASE}/athlete/0/events/${encodeURIComponent(String(eventId))}`, {
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
  const safeId = encodeURIComponent(String(eventId));
  const res = await fetch(`${API_BASE}/athlete/0/events/${safeId}`, {
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
  const res = await fetch(`${API_BASE}/activity/${encodeURIComponent(activityId)}`, {
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

// --- SINGLE EVENT CREATE ---

async function createSingleEvent(
  apiKey: string,
  workout: WorkoutEvent,
): Promise<number> {
  const auth = authHeader(apiKey);
  const payload = [{
    category: "WORKOUT",
    start_date_local: format(workout.start_date_local, "yyyy-MM-dd'T'HH:mm:ss"),
    name: workout.name,
    description: workout.description,
    external_id: workout.external_id,
    type: workout.type,
    ...(workout.fuelRate != null && { carbs_per_hour: Math.round(workout.fuelRate) }),
  }];

  const res = await fetch(`${API_BASE}/athlete/0/events/bulk?upsert=true`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to create event: ${res.status} ${errorText}`);
  }
  const created = (await res.json()) as { id: number }[];
  return created[0].id;
}

export async function replaceWorkoutOnDate(
  apiKey: string,
  existingEventId: number | undefined,
  workout: WorkoutEvent,
): Promise<number> {
  // Create first — if this fails, nothing is lost
  const newId = await createSingleEvent(apiKey, workout);
  if (existingEventId != null) {
    try {
      await deleteEvent(apiKey, existingEventId);
    } catch {
      // Old event remains as duplicate — recoverable. Better than losing it.
    }
  }
  return newId;
}

// --- WELLNESS ---

export interface WellnessEntry {
  id: string; // date YYYY-MM-DD
  restingHR?: number;
  hrv?: number; // rMSSD
  sleepSecs?: number;
  sleepScore?: number;
  readiness?: number; // 0-100 built-in score from Intervals.icu
  atl?: number;
  ctl?: number;
}

interface WellnessApiRow {
  id: string;
  restingHR?: number;
  hrv?: number; // Intervals.icu calls rMSSD "hrv"
  sleepSecs?: number;
  sleepScore?: number;
  readiness?: number;
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
      hrv: r.hrv,
      sleepSecs: r.sleepSecs,
      sleepScore: r.sleepScore,
      readiness: r.readiness,
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
): Promise<void> {
  const auth = authHeader(apiKey);
  const res = await fetch(`${API_BASE}/activity/${encodeURIComponent(activityId)}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ PreRunCarbsG: carbsG ?? 0 }),
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
  const res = await fetch(`${API_BASE}/activity/${encodeURIComponent(activityId)}`, {
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
  const res = await fetch(`${API_BASE}/activity/${encodeURIComponent(activityId)}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ carbs_ingested: carbsIngested }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to update activity carbs: ${res.status} ${errorText}`);
  }
}

// --- PACE CURVES ---

interface PaceCurveActivity {
  id: string;
  name: string;
  distance: number;
  moving_time: number;
  start_date_local: string;
}

interface PaceCurveApiResponse {
  list: {
    id: string;
    label: string;
    distance: number[];
    values: number[];
    activity_id: string[];
  }[];
  activities: Partial<Record<string, PaceCurveActivity>>;
}

const STANDARD_DISTANCES: { label: string; meters: number }[] = [
  { label: "1km", meters: 1000 },
  { label: "2km", meters: 2000 },
  { label: "5km", meters: 5000 },
  { label: "10km", meters: 10000 },
  { label: "16km", meters: 16000 },
  { label: "HM", meters: 21097.5 },
  { label: "Marathon", meters: 42195 },
];

function interpolateTime(
  distances: number[],
  times: number[],
  targetDist: number,
): number | null {
  // Find bracketing points
  let lo = -1;
  let hi = -1;
  for (let i = 0; i < distances.length; i++) {
    if (distances[i] <= targetDist) lo = i;
    if (distances[i] >= targetDist && hi === -1) hi = i;
  }
  if (lo === -1 || hi === -1) return null;
  if (lo === hi) return times[lo];

  // Linear interpolation
  const dLo = distances[lo];
  const dHi = distances[hi];
  const tLo = times[lo];
  const tHi = times[hi];
  const frac = (targetDist - dLo) / (dHi - dLo);
  return tLo + frac * (tHi - tLo);
}

function findActivityIdAtDistance(
  distances: number[],
  activityIds: string[],
  targetDist: number,
): string | undefined {
  // Find the closest distance that's <= target
  let bestIdx = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < distances.length; i++) {
    const diff = Math.abs(distances[i] - targetDist);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx >= 0 ? activityIds[bestIdx] : undefined;
}

export async function fetchPaceCurves(apiKey: string, curveId = "all"): Promise<PaceCurveData | null> {
  try {
    const auth = authHeader(apiKey);
    const now = new Date().toISOString();
    const url = `${API_BASE}/athlete/0/pace-curves?curves=${encodeURIComponent(curveId)}&type=Run&newest=${encodeURIComponent(now)}`;

    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) return null;

    const data = (await res.json()) as PaceCurveApiResponse;
    if (data.list.length === 0) return null;

    const curveData = data.list.find((c) => c.id === curveId);
    if (!curveData || curveData.distance.length === 0) return null;

    const { distance: distances, values: times, activity_id: activityIds } = curveData;

    // Build best efforts at standard distances
    const bestEfforts: BestEffort[] = [];
    for (const { label, meters } of STANDARD_DISTANCES) {
      const maxDist = distances[distances.length - 1];
      if (meters > maxDist) continue; // Can't interpolate beyond data

      const timeSeconds = interpolateTime(distances, times, meters);
      if (timeSeconds === null) continue;

      const pace = (timeSeconds / meters) * 1000 / 60; // min/km
      const activityId = findActivityIdAtDistance(distances, activityIds, meters);
      const activity = activityId != null ? data.activities[activityId] : undefined;

      bestEfforts.push({
        distance: meters,
        label,
        timeSeconds,
        pace,
        activityId,
        activityName: activity?.name,
        activityDate: activity?.start_date_local,
      });
    }

    // Find longest run from activities
    let longestRun: PaceCurveData["longestRun"] = null;
    let maxDist = 0;
    for (const [id, activity] of Object.entries(data.activities)) {
      if (activity && activity.distance > maxDist) {
        maxDist = activity.distance;
        longestRun = {
          distance: activity.distance,
          activityId: id,
          activityName: activity.name,
          activityDate: activity.start_date_local,
          movingTime: activity.moving_time,
        };
      }
    }

    // Build curve data for chart (sample at reasonable intervals)
    const curve: { distance: number; pace: number }[] = [];
    for (let i = 0; i < distances.length; i++) {
      const d = distances[i];
      const t = times[i];
      if (d > 0 && t > 0) {
        const pace = (t / d) * 1000 / 60; // min/km
        curve.push({ distance: d, pace });
      }
    }

    return { bestEfforts, longestRun, curve };
  } catch (e) {
    console.error("Failed to fetch pace curves:", e);
    return null;
  }
}
