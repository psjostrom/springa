import { http, HttpResponse } from "msw";
import { API_BASE } from "../../constants";
import { sampleActivities, sampleEvents, sampleStreams } from "./fixtures";
import type { CalendarEvent } from "../../types";

/** Convert raw Intervals.icu fixtures to CalendarEvent format for proxy route mocks. */
function fixtureCalendarEvents(): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // Activities → completed events
  for (const a of sampleActivities) {
    events.push({
      id: `activity-${a.id}`,
      date: new Date(a.start_date_local ?? a.start_date),
      name: a.name,
      description: a.description ?? "",
      type: "completed",
      activityId: a.id,
      category: /long/i.test(a.name) ? "long" : /interval|hill|speed|tempo/i.test(a.name) ? "interval" : "easy",
      distance: a.distance,
      duration: a.moving_time,
      avgHr: a.average_heartrate,
      maxHr: a.max_heartrate,
      pace: a.pace,
      load: a.icu_training_load,
      intensity: a.icu_intensity,
      zoneTimes: a.icu_hr_zone_times ? {
        z1: a.icu_hr_zone_times[0],
        z2: a.icu_hr_zone_times[1],
        z3: a.icu_hr_zone_times[2],
        z4: a.icu_hr_zone_times[3],
        z5: a.icu_hr_zone_times[4],
      } : undefined,
    });
  }

  // Planned events (without paired activity)
  for (const e of sampleEvents) {
    if (e.paired_activity_id) continue; // skip paired — already represented by activity
    events.push({
      id: `event-${e.id}`,
      date: new Date(e.start_date_local),
      name: e.name,
      description: e.description,
      type: "planned",
      category: /long/i.test(e.name) ? "long" : /interval|hill|speed|tempo/i.test(e.name) ? "interval" : "easy",
      fuelRate: e.carbs_per_hour,
      duration: e.duration,
    });
  }

  return events;
}

// Capture payloads for assertion in tests
export let capturedUploadPayload: unknown[] = [];
export let capturedPutPayload: { url: string; body: unknown } | null = null;
export let capturedDeleteEventIds: string[] = [];
export let capturedGoogleCalendarEvents: unknown[] = [];
export let capturedGoogleDeletedEventIds: string[] = [];
export let capturedActivityPutPayloads: { activityId: string; body: unknown }[] = [];
export let capturedSportSettingsPayload: Record<string, unknown> | null = null;
export let capturedAthletePayload: Record<string, unknown> | null = null;

export function resetCaptures() {
  capturedUploadPayload = [];
  capturedPutPayload = null;
  capturedDeleteEventIds = [];
  capturedGoogleCalendarEvents = [];
  capturedGoogleDeletedEventIds = [];
  capturedActivityPutPayloads = [];
  capturedSportSettingsPayload = null;
  capturedAthletePayload = null;
}

export const handlers = [
  // --- External Intervals.icu API (used by server-side route handlers) ---

  // GET activities
  http.get(`${API_BASE}/athlete/0/activities`, () => {
    return HttpResponse.json(sampleActivities);
  }),

  // GET events
  http.get(`${API_BASE}/athlete/0/events`, () => {
    return HttpResponse.json(sampleEvents);
  }),

  // PUT sport settings (HR zones, threshold pace, pace zones)
  http.put(`${API_BASE}/athlete/0/sport-settings/:settingsId`, async ({ request }) => {
    capturedSportSettingsPayload = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ id: 2080947, ...capturedSportSettingsPayload });
  }),

  // PUT athlete profile (resting HR, etc.)
  http.put(`${API_BASE}/athlete/0`, async ({ request }) => {
    capturedAthletePayload = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ok: true });
  }),

  // DELETE future workouts
  http.delete(`${API_BASE}/athlete/0/events`, () => {
    return new HttpResponse(null, { status: 200 });
  }),

  // POST bulk upload
  http.post(`${API_BASE}/athlete/0/events/bulk`, async ({ request }) => {
    capturedUploadPayload = (await request.json()) as unknown[];
    return HttpResponse.json(capturedUploadPayload.map((_, i) => ({ id: 1000 + i })));
  }),

  // PUT update single event
  http.put(`${API_BASE}/athlete/0/events/:eventId`, async ({ request }) => {
    capturedPutPayload = {
      url: request.url,
      body: await request.json(),
    };
    return HttpResponse.json({ ok: true });
  }),

  // DELETE single event
  http.delete(`${API_BASE}/athlete/0/events/:eventId`, ({ params }) => {
    capturedDeleteEventIds.push(params.eventId as string);
    return new HttpResponse(null, { status: 200 });
  }),

  // PUT activity (pair, update carbs, etc.)
  http.put(`${API_BASE}/activity/:activityId`, async ({ params, request }) => {
    capturedActivityPutPayloads.push({
      activityId: params.activityId as string,
      body: await request.json(),
    });
    return HttpResponse.json({ ok: true });
  }),

  // GET activity streams
  http.get(`${API_BASE}/activity/:activityId/streams`, () => {
    return HttpResponse.json(sampleStreams);
  }),

  // GET athlete profile / connection status (all platforms disconnected by default)
  http.get(`${API_BASE}/athlete/0`, () => {
    return HttpResponse.json({
      id: 0,
      sportSettings: [],
      icu_garmin_health: false,
      icu_garmin_sync_activities: false,
      icu_garmin_upload_workouts: false,
    });
  }),

  // GET pace curves
  http.get(`${API_BASE}/athlete/0/pace-curves`, () => {
    return HttpResponse.json({ list: [], activities: {} });
  }),

  // --- Proxy routes (used by client-side intervalsClient.ts) ---

  // GET calendar via proxy
  http.get("/api/intervals/calendar", () => {
    return HttpResponse.json(fixtureCalendarEvents());
  }),

  // POST bulk upload via proxy
  http.post("/api/intervals/events/bulk", async ({ request }) => {
    const body = (await request.json()) as { events: unknown[] };
    capturedUploadPayload = body.events;
    return HttpResponse.json({ count: body.events.length });
  }),

  // PUT update single event via proxy
  http.put("/api/intervals/events/:eventId", async ({ request }) => {
    capturedPutPayload = {
      url: request.url,
      body: await request.json(),
    };
    return HttpResponse.json({ ok: true });
  }),

  // DELETE single event via proxy
  http.delete("/api/intervals/events/:eventId", ({ params }) => {
    capturedDeleteEventIds.push(params.eventId as string);
    return HttpResponse.json({ ok: true });
  }),

  // GET activity streams via proxy
  http.get("/api/intervals/activity/:activityId", ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get("streams") === "1") {
      return HttpResponse.json({ streamData: sampleStreams, avgHr: 145, maxHr: 170 });
    }
    // Return a basic activity
    const activity = sampleActivities.find((a) => a.id === url.pathname.split("/").pop());
    return HttpResponse.json(activity ?? { id: "unknown" });
  }),

  // DELETE activity via proxy
  http.delete("/api/intervals/activity/:activityId", () => {
    return HttpResponse.json({ ok: true });
  }),

  // POST replace workout via proxy
  http.post("/api/intervals/events/replace", async ({ request }) => {
    const body = (await request.json()) as { existingEventId?: number; workout: unknown };
    capturedUploadPayload = [body.workout];
    return HttpResponse.json({ newId: 9999 });
  }),

  // PUT threshold pace via proxy
  http.put("/api/intervals/threshold-pace", () => {
    return HttpResponse.json({ ok: true });
  }),

  // PUT HR zones via proxy
  http.put("/api/intervals/hr-zones", () => {
    return HttpResponse.json({ ok: true });
  }),

  // POST run analysis (LLM-generated post-run analysis)
  http.post("/api/run-analysis", () => {
    return HttpResponse.json({ analysis: "Test analysis." });
  }),

  // GET bg-patterns (cached cross-run patterns)
  http.get("/api/bg-patterns", () => {
    return HttpResponse.json({ patterns: null, latestActivityId: null });
  }),

  // POST bg-patterns (discover/re-analyze patterns)
  http.post("/api/bg-patterns", () => {
    return HttpResponse.json({ patterns: "Test patterns.", latestActivityId: "a123" });
  }),

  // GET insulin context (IOB polling in useHydrateStore)
  http.get("/api/insulin-context", () => {
    return HttpResponse.json({ iob: 0 });
  }),

  // GET BG readings (useCurrentBG polls this on mount)
  http.get("/api/bg", () => {
    return HttpResponse.json({ readings: [], trend: null });
  }),

  // GET pre-run carbs (PreRunCarbsInput fetches on mount)
  http.get("/api/prerun-carbs", () => {
    return HttpResponse.json({ carbsG: null });
  }),

  // DELETE pre-run carbs (cleanup after Intervals.icu write)
  http.delete("/api/prerun-carbs", () => {
    return HttpResponse.json({ ok: true });
  }),

  // Google Calendar sync API route (fire-and-forget)
  http.post("/api/google-calendar-sync", () => {
    return HttpResponse.json({ synced: true });
  }),

  // PUT /api/settings (Intervals.icu key validation, Nightscout, etc.)
  http.put("/api/settings", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.intervalsApiKey === "invalid-key") {
      return HttpResponse.json(
        { error: "Failed to validate Intervals.icu API key" },
        { status: 400 },
      );
    }
    return HttpResponse.json({ ok: true });
  }),

  // Google OAuth token exchange
  http.post("https://oauth2.googleapis.com/token", () => {
    return HttpResponse.json({
      access_token: "mock-access-token",
      expires_in: 3600,
      token_type: "Bearer",
    });
  }),

  // Google Calendar — get calendar (verify it exists)
  http.get("https://www.googleapis.com/calendar/v3/calendars/:calendarId", ({ params }) => {
    if (params.calendarId === "existing-cal-id") {
      return HttpResponse.json({ id: "existing-cal-id", summary: "Springa" });
    }
    return new HttpResponse(null, { status: 404 });
  }),

  // Google Calendar — create calendar
  http.post("https://www.googleapis.com/calendar/v3/calendars", () => {
    return HttpResponse.json({ id: "new-cal-id", summary: "Springa" });
  }),

  // Google Calendar — list events
  http.get("https://www.googleapis.com/calendar/v3/calendars/:calendarId/events", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    if (q) {
      return HttpResponse.json({
        items: [{ id: "gcal-event-1", summary: q, start: { dateTime: "2026-04-01T12:00:00+02:00" } }],
      });
    }
    return HttpResponse.json({
      items: [
        { id: "gcal-event-1", summary: "W01 Easy", start: { dateTime: "2026-04-01T12:00:00+02:00" } },
        { id: "gcal-event-2", summary: "W01 Long", start: { dateTime: "2026-04-06T09:00:00+02:00" } },
      ],
    });
  }),

  // Google Calendar — create event
  http.post("https://www.googleapis.com/calendar/v3/calendars/:calendarId/events", async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    capturedGoogleCalendarEvents.push(body);
    return HttpResponse.json({ id: `gcal-${capturedGoogleCalendarEvents.length}`, ...body });
  }),

  // Google Calendar — update event
  http.patch("https://www.googleapis.com/calendar/v3/calendars/:calendarId/events/:eventId", () => {
    return HttpResponse.json({ id: "gcal-event-1", summary: "Updated" });
  }),

  // Google Calendar — delete event
  http.delete("https://www.googleapis.com/calendar/v3/calendars/:calendarId/events/:eventId", ({ params }) => {
    capturedGoogleDeletedEventIds.push(params.eventId as string);
    return new HttpResponse(null, { status: 204 });
  }),
];
