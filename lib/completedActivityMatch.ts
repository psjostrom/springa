import { API_BASE } from "./constants";
import { authHeader } from "./intervalsApi";
import type { IntervalsActivity, IntervalsEvent } from "./types";
import { findAuthoritativeWorkoutEventMatch } from "./workoutEventMatching";

export interface CompletedActivityMatch {
  event: IntervalsEvent | null;
  eventId: number | null;
}

function shiftDateString(dateStr: string, dayOffset: number): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

export async function findCompletedActivityMatch(
  apiKey: string,
  activity: IntervalsActivity,
): Promise<CompletedActivityMatch> {
  const dateStr = (activity.start_date_local ?? activity.start_date).slice(
    0,
    10,
  );
  const oldest = shiftDateString(dateStr, -3);
  const newest = shiftDateString(dateStr, 3);

  try {
    const res = await fetch(
      `${API_BASE}/athlete/0/events?oldest=${oldest}T00:00:00&newest=${newest}T23:59:59`,
      { headers: { Authorization: authHeader(apiKey) } },
    );
    if (!res.ok) return { event: null, eventId: null };

    const events = (await res.json()) as IntervalsEvent[];
    // Completed feedback must use an explicit pair, never a nearby name/date guess.
    const event = findAuthoritativeWorkoutEventMatch(activity, events) ?? null;
    return { event, eventId: event?.id ?? null };
  } catch (error) {
    console.error(
      "Failed to find matching event for activity:",
      activity.id,
      error,
    );
    return { event: null, eventId: null };
  }
}
