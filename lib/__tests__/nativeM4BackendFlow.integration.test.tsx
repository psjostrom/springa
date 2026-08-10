import { Buffer } from "node:buffer";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.AUTH_SECRET = "native-m4-flow-auth-secret";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "44".repeat(32);
  return { holder: { db: null as unknown as Client } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

// eslint-disable-next-line no-restricted-syntax -- auth boundary; Bearer verification remains real
vi.mock("@/lib/auth", () => ({
  auth: () => Promise.resolve(null),
}));

import { GET as calendarGET } from "@/app/api/intervals/calendar/route";
import {
  DELETE as eventDELETE,
  GET as eventGET,
  PUT as eventPUT,
} from "@/app/api/intervals/events/[id]/route";
import { POST as replacePOST } from "@/app/api/intervals/events/replace/route";
import {
  GET as carbsGET,
  POST as carbsPOST,
} from "@/app/api/prerun-carbs/route";
import { API_BASE } from "@/lib/constants";
import { encrypt } from "@/lib/credentials";
import { SCHEMA_DDL } from "@/lib/db";
import { signMobileToken } from "@/lib/mobileAuth";
import { server } from "./msw/server";

const EMAIL = "native-flow@example.com";
const SMHI_URL =
  "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/17.81/lat/59.45/data.json";
const originalUint8Array = globalThis.Uint8Array;
const nodeUint8Array = Object.getPrototypeOf(Buffer.prototype)
  .constructor as typeof Uint8Array;

interface ExternalEvent {
  id: number;
  category: string;
  type: string;
  start_date_local: string;
  name: string;
  description: string;
  paired_activity_id: null;
  carbs_per_hour: number;
  external_id?: string;
}

let event: ExternalEvent | null;
let bearerHeaders: Record<string, string>;
let intervalsAuthHeaders: (string | null)[];

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(bearerHeaders);
  new Headers(init.headers).forEach((value, key) => {
    headers.set(key, value);
  });
  return new Request(`http://localhost${path}`, {
    ...init,
    headers,
  });
}

function eventParams() {
  return { params: Promise.resolve({ id: "event-123" }) };
}

beforeAll(async () => {
  globalThis.Uint8Array = nodeUint8Array;
  await holder.db.executeMultiple(SCHEMA_DDL);
});

afterAll(() => {
  globalThis.Uint8Array = originalUint8Array;
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));
  await holder.db.executeMultiple(SCHEMA_DDL);
  await holder.db.execute("DELETE FROM activity_streams");
  await holder.db.execute("DELETE FROM prerun_carbs");
  await holder.db.execute("DELETE FROM user_settings");
  await holder.db.execute({
    sql: `INSERT INTO user_settings (
            email, intervals_api_key, timezone, warmth_preference,
            race_date, race_dist, total_weeks, start_km,
            include_base_phase, diabetes_mode, run_days, long_run_day,
            current_ability_secs, current_ability_dist, effort_metric,
            hr_zones, max_hr
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      EMAIL,
      encrypt("intervals-key", process.env.CREDENTIALS_ENCRYPTION_KEY!),
      "Europe/Stockholm",
      0,
      "2026-11-01",
      16,
      12,
      11,
      0,
      1,
      JSON.stringify([2, 4, 6, 0]),
      0,
      7200,
      16,
      "pace",
      JSON.stringify([120, 140, 160, 175, 190]),
      200,
    ],
  });

  event = {
    id: 123,
    category: "WORKOUT",
    type: "Run",
    start_date_local: "2026-08-13T12:00:00",
    name: "W05 Easy",
    description: [
      "Steady easy running.",
      "",
      "Warmup",
      "- 10m 6:15-18:20/km Pace intensity=warmup",
      "",
      "Main set",
      "- 20m 6:15-18:20/km Pace intensity=active",
      "",
      "Cooldown",
      "- 15m 6:15-18:20/km Pace intensity=cooldown",
    ].join("\n"),
    paired_activity_id: null,
    carbs_per_hour: 60,
  };
  intervalsAuthHeaders = [];

  const { token } = await signMobileToken(EMAIL);
  bearerHeaders = { Authorization: `Bearer ${token}` };

  server.use(
    http.get(`${API_BASE}/athlete/0`, ({ request: externalRequest }) => {
      intervalsAuthHeaders.push(externalRequest.headers.get("authorization"));
      return HttpResponse.json({
        sportSettings: [{
          id: 1,
          types: ["Run"],
          lthr: 168,
          max_hr: 200,
          hr_zones: [120, 140, 160, 175, 190],
        }],
      });
    }),
    http.get(`${API_BASE}/athlete/0/activities`, ({ request: externalRequest }) => {
      intervalsAuthHeaders.push(externalRequest.headers.get("authorization"));
      return HttpResponse.json([]);
    }),
    http.get(`${API_BASE}/athlete/0/events`, ({ request: externalRequest }) => {
      intervalsAuthHeaders.push(externalRequest.headers.get("authorization"));
      return HttpResponse.json(event ? [event] : []);
    }),
    http.get(`${API_BASE}/athlete/0/events/:eventId`, ({ request: externalRequest }) => {
      intervalsAuthHeaders.push(externalRequest.headers.get("authorization"));
      return event
        ? HttpResponse.json(event)
        : new HttpResponse(null, { status: 404 });
    }),
    http.put(`${API_BASE}/athlete/0/events/:eventId`, async ({ request: externalRequest }) => {
      intervalsAuthHeaders.push(externalRequest.headers.get("authorization"));
      const body = (await externalRequest.json()) as Partial<ExternalEvent>;
      if (event) event = { ...event, ...body };
      return HttpResponse.json({ ok: true });
    }),
    http.delete(`${API_BASE}/athlete/0/events/:eventId`, ({ request: externalRequest }) => {
      intervalsAuthHeaders.push(externalRequest.headers.get("authorization"));
      event = null;
      return new HttpResponse(null, { status: 200 });
    }),
    http.get(SMHI_URL, () =>
      HttpResponse.json({
        timeSeries: [{
          time: "2026-08-13T10:00:00.000Z",
          data: {
            air_temperature: 16,
            wind_speed: 2,
            wind_speed_of_gust: 4,
            precipitation_amount_mean: 0,
            predominant_precipitation_type_at_surface: 0,
          },
        }],
      }),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

it("supports full native planned-workout flow through Springa route handlers", async () => {
  const detail = await eventGET(
    request("/api/intervals/events/event-123"),
    eventParams(),
  );
  const detailBody = await detail.json();
  expect(detail.status).toBe(200);
  expect(detailBody.event).toMatchObject({
    id: "event-123",
    intervalsEventId: 123,
    name: "W05 Easy",
  });
  expect(detailBody.structure.sections).not.toEqual([]);
  expect(detailBody.metrics).toMatchObject({
    fuelRateGPerHour: 60,
    prescribedCarbsG: 45,
  });
  expect(detailBody.clothing.status).toBe("available");

  const saveCarbs = await carbsPOST(request("/api/prerun-carbs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: "event-123", carbsG: 25 }),
  }));
  expect(saveCarbs.status).toBe(200);
  await expect(saveCarbs.json()).resolves.toEqual({ ok: true });

  const readCarbs = await carbsGET(
    request("/api/prerun-carbs?eventId=event-123"),
  );
  await expect(readCarbs.json()).resolves.toEqual({ carbsG: 25 });

  const move = await eventPUT(
    request("/api/intervals/events/event-123", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date_local: "2026-08-14T12:00:00" }),
    }),
    eventParams(),
  );
  expect(move.status).toBe(200);
  expect(event?.start_date_local).toBe("2026-08-14T12:00:00");

  const movedCalendar = await calendarGET(request(
    "/api/intervals/calendar?oldest=2026-08-01&newest=2026-08-31",
  ));
  expect(movedCalendar.status).toBe(200);
  await expect(movedCalendar.json()).resolves.toEqual([
    expect.objectContaining({ id: "event-123", name: "W05 Easy", type: "planned" }),
  ]);

  const replace = await replacePOST(request("/api/intervals/events/replace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ existingEventId: "event-123", category: "quality" }),
  }));
  expect(replace.status).toBe(200);
  await expect(replace.json()).resolves.toEqual({ newId: 123 });
  expect(event).toMatchObject({
    id: 123,
    name: "W01 Short Intervals",
    external_id: "ondemand-2026-08-14",
    type: "Run",
    start_date_local: "2026-08-14T12:00:00",
    carbs_per_hour: 60,
  });
  expect(event?.description).toContain("Warmup");

  const resetCarbs = await carbsGET(
    request("/api/prerun-carbs?eventId=event-123"),
  );
  await expect(resetCarbs.json()).resolves.toEqual({ carbsG: null });

  const replacedCalendar = await calendarGET(request(
    "/api/intervals/calendar?oldest=2026-08-01&newest=2026-08-31",
  ));
  expect(replacedCalendar.status).toBe(200);
  await expect(replacedCalendar.json()).resolves.toEqual([
    expect.objectContaining({
      id: "event-123",
      name: "W01 Short Intervals",
      type: "planned",
    }),
  ]);

  const remove = await eventDELETE(
    request("/api/intervals/events/event-123", { method: "DELETE" }),
    eventParams(),
  );
  expect(remove.status).toBe(200);
  expect(event).toBeNull();

  const deletedCalendar = await calendarGET(request(
    "/api/intervals/calendar?oldest=2026-08-01&newest=2026-08-31",
  ));
  expect(deletedCalendar.status).toBe(200);
  await expect(deletedCalendar.json()).resolves.toEqual([]);
  expect(intervalsAuthHeaders.length).toBeGreaterThan(0);
  expect(new Set(intervalsAuthHeaders)).toEqual(
    new Set([`Basic ${btoa("API_KEY:intervals-key")}`]),
  );
});
