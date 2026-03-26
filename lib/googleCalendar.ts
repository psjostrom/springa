import { format } from "date-fns";
import type { WorkoutEvent } from "./types";
import { estimateWorkoutDuration, getEstimatedDuration } from "./workoutMath";
import {
  getGoogleCalendarCredentials,
  updateGoogleRefreshToken,
  updateGoogleCalendarId,
} from "./credentials";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** Exchange a refresh token for a short-lived access token. */
export async function getGoogleAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

/** Verify a calendar exists, or create a new "Springa" calendar. Returns the calendar ID. */
export async function ensureSpringaCalendar(
  accessToken: string,
  storedCalendarId: string | null,
  timezone: string,
): Promise<string> {
  if (storedCalendarId) {
    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(storedCalendarId)}`, {
      headers: authHeaders(accessToken),
    });
    if (res.ok) return storedCalendarId;
  }

  const res = await fetch(`${CALENDAR_API}/calendars`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ summary: "Springa", timeZone: timezone }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create Springa calendar: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

/** Create Google Calendar events from WorkoutEvents. Sequential to avoid rate limits. */
export async function syncEventsToGoogle(
  accessToken: string,
  calendarId: string,
  events: WorkoutEvent[],
  timezone: string,
): Promise<void> {
  for (const event of events) {
    const durationMin = estimateWorkoutDuration(event.description)?.minutes
      ?? getEstimatedDuration(event);
    const startDate = event.start_date_local;
    const endDate = new Date(startDate.getTime() + durationMin * 60_000);

    const body = {
      summary: event.name,
      description: formatEventDescription(event),
      start: { dateTime: format(startDate, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: timezone },
      end: { dateTime: format(endDate, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: timezone },
    };

    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`Failed to create Google Calendar event "${event.name}": ${res.status}`);
    }
  }
}

/** Delete all future events on the Springa calendar. */
export async function clearFutureGoogleEvents(
  accessToken: string,
  calendarId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(now)}&maxResults=2500&singleEvents=true`,
    { headers: authHeaders(accessToken) },
  );
  if (!res.ok) return;

  const data = (await res.json()) as { items?: { id: string }[] };
  for (const item of data.items ?? []) {
    await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(item.id)}`,
      { method: "DELETE", headers: authHeaders(accessToken) },
    );
  }
}

/** Find a Google Calendar event by summary (name) and date. Returns the event ID or null. */
export async function findGoogleEvent(
  accessToken: string,
  calendarId: string,
  name: string,
  date: string,
): Promise<string | null> {
  const dayStart = `${date}T00:00:00Z`;
  const dayEnd = `${date}T23:59:59Z`;
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?q=${encodeURIComponent(name)}&timeMin=${encodeURIComponent(dayStart)}&timeMax=${encodeURIComponent(dayEnd)}&singleEvents=true`,
    { headers: authHeaders(accessToken) },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as { items?: { id: string; summary: string }[] };
  const match = data.items?.find((e) => e.summary === name);
  return match?.id ?? null;
}

export interface EventUpdates {
  summary?: string;
  description?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
}

/** Update a Google Calendar event by its ID. */
export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  googleEventId: string,
  updates: EventUpdates,
): Promise<void> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify(updates),
    },
  );
  if (!res.ok) {
    console.warn(`Failed to update Google Calendar event ${googleEventId}: ${res.status}`);
  }
}

/** Delete a Google Calendar event by its ID. */
export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  googleEventId: string,
): Promise<void> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    { method: "DELETE", headers: authHeaders(accessToken) },
  );
  if (!res.ok) {
    console.warn(`Failed to delete Google Calendar event ${googleEventId}: ${res.status}`);
  }
}

/** Build the Google Calendar event description text. */
export function formatEventDescription(
  event: WorkoutEvent,
  hrZones?: number[],
  lthr?: number,
): string {
  const lines: string[] = [];

  if (hrZones?.length === 5 && lthr) {
    const isInterval = /interval|hills|short|tempo|fartlek|threshold|speed/i.test(event.name);
    if (isInterval) {
      lines.push(`HR target: Z4 (${hrZones[3]}-${hrZones[4]} bpm)`);
    } else {
      lines.push(`HR target: Z2 (${hrZones[1]}-${hrZones[2]} bpm)`);
    }
  }

  if (event.fuelRate != null) {
    lines.push(`Fuel: ${Math.round(event.fuelRate)} g/h`);
  }

  if (lines.length > 0 && event.description) {
    lines.push("");
  }
  if (event.description) {
    lines.push(event.description);
  }

  return lines.join("\n");
}

/** Resolve refresh token → access token → calendar ID. Call once per user action. */
export async function getGoogleCalendarContext(
  email: string,
): Promise<{ accessToken: string; calendarId: string; timezone: string } | null> {
  const creds = await getGoogleCalendarCredentials(email);
  if (!creds?.refreshToken) return null;

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(creds.refreshToken);
  } catch {
    // Token revoked or expired — clear it so next sign-in re-prompts consent
    await updateGoogleRefreshToken(email, null);
    return null;
  }

  const calendarId = await ensureSpringaCalendar(accessToken, creds.calendarId, creds.timezone);

  // Persist calendar ID if it changed (first creation or recreation after deletion)
  if (calendarId !== creds.calendarId) {
    await updateGoogleCalendarId(email, calendarId);
  }

  return { accessToken, calendarId, timezone: creds.timezone };
}

/** Client-side helper: fire-and-forget Google Calendar sync via API route. */
export async function syncToGoogleCalendar(
  action: "bulk-sync" | "update" | "delete",
  payload: {
    events?: WorkoutEvent[];
    eventName?: string;
    eventDate?: string;
    updates?: { name?: string; date?: string; description?: string };
  },
): Promise<void> {
  try {
    await fetch("/api/google-calendar-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (e) {
    console.warn("Google Calendar sync failed:", e);
  }
}
