import { http, HttpResponse } from "msw";
import { API_BASE } from "../../constants";
import { sampleActivities, sampleEvents, sampleStreams } from "./fixtures";

// Capture payloads for assertion in tests
export let capturedUploadPayload: unknown[] = [];
export let capturedPutPayload: { url: string; body: unknown } | null = null;

export function resetCaptures() {
  capturedUploadPayload = [];
  capturedPutPayload = null;
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

  // GET activity streams
  http.get(`${API_BASE}/activity/:activityId/streams`, () => {
    return HttpResponse.json(sampleStreams);
  }),
];
