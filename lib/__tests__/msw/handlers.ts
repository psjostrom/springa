import { http, HttpResponse } from "msw";
import { API_BASE } from "../../constants";
import { sampleActivities, sampleEvents, sampleStreams } from "./fixtures";

// Capture payloads for assertion in tests
export let capturedUploadPayload: unknown[] = [];
export let capturedPutPayload: { url: string; body: unknown } | null = null;
export let capturedDeleteEventIds: string[] = [];
export let capturedGoogleCalendarEvents: unknown[] = [];
export let capturedGoogleDeletedEventIds: string[] = [];

export function resetCaptures() {
  capturedUploadPayload = [];
  capturedPutPayload = null;
  capturedDeleteEventIds = [];
  capturedGoogleCalendarEvents = [];
  capturedGoogleDeletedEventIds = [];
}

export const handlers = [
  // GET activities
  http.get(`${API_BASE}/athlete/0/activities`, () => {
    return HttpResponse.json(sampleActivities);
  }),

  // GET events
  http.get(`${API_BASE}/athlete/0/events`, () => {
    return HttpResponse.json(sampleEvents);
  }),

  // DELETE future workouts
  http.delete(`${API_BASE}/athlete/0/events`, () => {
    return new HttpResponse(null, { status: 200 });
  }),

  // POST bulk upload
  http.post(`${API_BASE}/athlete/0/events/bulk`, async ({ request }) => {
    capturedUploadPayload = (await request.json()) as unknown[];
    return HttpResponse.json(capturedUploadPayload);
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

  // GET activity streams
  http.get(`${API_BASE}/activity/:activityId/streams`, () => {
    return HttpResponse.json(sampleStreams);
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
