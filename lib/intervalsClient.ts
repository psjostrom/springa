// Client-side wrappers for Intervals.icu operations.
// All calls go through authenticated Springa proxy routes.
// The API key never leaves the server.

import type {
  CalendarEvent,
  WorkoutEvent,
  PaceCurveData,
  IntervalsStream,
  IntervalsActivity,
} from "./types";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Request failed: ${res.status}`;
    try {
      const json = JSON.parse(text) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // Not JSON — use raw text as-is
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function fetchCalendar(
  oldest: string,
  newest: string,
): Promise<CalendarEvent[]> {
  const res = await fetch(
    `/api/intervals/calendar?oldest=${oldest}&newest=${newest}`,
  );
  const raw = await jsonOrThrow<CalendarEvent[]>(res);
  // JSON serialization converts Date objects to ISO strings — parse them back
  return raw.map((e) => ({ ...e, date: new Date(e.date) }));
}

export async function fetchActivity(
  activityId: string,
): Promise<IntervalsActivity | null> {
  const res = await fetch(`/api/intervals/activity/${activityId}`);
  if (!res.ok) return null;
  return res.json() as Promise<IntervalsActivity>;
}

export async function fetchActivityStreams(activityId: string): Promise<{
  avgHr?: number;
  maxHr?: number;
  streamData?: Record<string, unknown>;
}> {
  const res = await fetch(`/api/intervals/activity/${activityId}?streams=1`);
  return jsonOrThrow(res);
}

export async function fetchStreams(
  activityIds: string[],
): Promise<Record<string, IntervalsStream[]>> {
  const res = await fetch("/api/intervals/streams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activityIds }),
  });
  return jsonOrThrow(res);
}

export async function fetchPaceCurves(
  curveId = "all",
): Promise<PaceCurveData | null> {
  const res = await fetch(`/api/intervals/pace-curves?curve=${curveId}`);
  if (!res.ok) return null;
  return res.json() as Promise<PaceCurveData | null>;
}

export async function updateEvent(
  eventId: number,
  updates: {
    start_date_local?: string;
    name?: string;
    description?: string;
    carbs_per_hour?: number;
  },
): Promise<void> {
  const res = await fetch(`/api/intervals/events/${eventId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to update event: ${res.status}`);
  }
}

export async function uploadPlan(events: WorkoutEvent[]): Promise<number> {
  const res = await fetch("/api/intervals/events/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
  const data = await jsonOrThrow<{ count: number }>(res);
  return data.count;
}

export async function replaceWorkout(
  existingEventId: number | undefined,
  workout: WorkoutEvent,
): Promise<number> {
  const res = await fetch("/api/intervals/events/replace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ existingEventId, workout }),
  });
  const data = await jsonOrThrow<{ newId: number }>(res);
  return data.newId;
}

export async function deleteEvent(eventId: number): Promise<void> {
  const res = await fetch(`/api/intervals/events/${eventId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to delete event: ${res.status}`);
  }
}

export async function updateActivityCarbs(
  activityId: string,
  carbsIngested: number,
): Promise<void> {
  const res = await fetch(`/api/intervals/activity/${activityId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ carbs_ingested: carbsIngested }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to update activity carbs: ${res.status}`);
  }
}

export async function updateActivityPreRunCarbs(
  activityId: string,
  carbsG: number | null,
): Promise<void> {
  const res = await fetch(`/api/intervals/activity/${activityId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ PreRunCarbsG: carbsG ?? 0 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to update pre-run carbs: ${res.status}`);
  }
}

export async function deleteActivity(activityId: string): Promise<void> {
  const res = await fetch(`/api/intervals/activity/${activityId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to delete activity: ${res.status}`);
  }
}
