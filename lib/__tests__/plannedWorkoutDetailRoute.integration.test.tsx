import { Buffer } from "node:buffer";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { API_BASE } from "@/lib/constants";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.AUTH_SECRET = "planned-detail-mobile-auth-secret";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "11".repeat(32);
  return {
    holder: { db: null as unknown as Client },
  };
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

import { GET } from "@/app/api/intervals/events/[id]/route";
import { encrypt } from "@/lib/credentials";
import { SCHEMA_DDL } from "@/lib/db";
import { signMobileToken } from "@/lib/mobileAuth";
import { buildPlannedWorkoutDetail } from "@/lib/plannedWorkoutDetail";
import { server } from "./msw/server";

const EMAIL = "native@example.com";
const EVENT_URL = `${API_BASE}/athlete/0/events/123`;
const SMHI_URL =
  "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/17.81/lat/59.45/data.json";
const description = [
  "Steady easy running.",
  "",
  "Warmup",
  "- 10m 68-76% LTHR (114-128 bpm)",
  "",
  "Main set",
  "- 35m 68-76% LTHR (114-128 bpm)",
  "",
  "Cooldown",
  "- 15m 68-76% LTHR (114-128 bpm)",
  "",
].join("\n");
const plannedEvent = {
  id: 123,
  category: "WORKOUT",
  type: "Run",
  start_date_local: "2026-08-13T12:00:00",
  name: "W05 Easy",
  description,
  paired_activity_id: null,
  carbs_per_hour: 60,
};

const originalUint8Array = globalThis.Uint8Array;
const nodeUint8Array = Object.getPrototypeOf(Buffer.prototype)
  .constructor as typeof Uint8Array;

describe("GET /api/intervals/events/[id]", () => {
  beforeAll(async () => {
    globalThis.Uint8Array = nodeUint8Array;
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  afterAll(() => {
    globalThis.Uint8Array = originalUint8Array;
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));
    await holder.db.execute("DELETE FROM prerun_carbs");
    await holder.db.execute("DELETE FROM activity_streams");
    await holder.db.execute("DELETE FROM user_settings");

    const encryptedKey = encrypt(
      "intervals-key",
      process.env.CREDENTIALS_ENCRYPTION_KEY!,
    );
    await holder.db.execute({
      sql: `INSERT INTO user_settings (
              email, intervals_api_key, timezone, warmth_preference,
              current_ability_dist, current_ability_secs, hr_zones, max_hr
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        EMAIL,
        encryptedKey,
        "Europe/Stockholm",
        1,
        10,
        3000,
        JSON.stringify([120, 140, 160, 175, 190]),
        190,
      ],
    });
    await holder.db.execute({
      sql: `INSERT INTO prerun_carbs (email, event_id, carbs_g, created_at)
            VALUES (?, ?, ?, ?)`,
      args: [EMAIL, "123", 25, Date.now()],
    });

    server.use(
      http.get(EVENT_URL, ({ request }) =>
        request.headers.get("authorization") ===
        `Basic ${btoa("API_KEY:intervals-key")}`
          ? HttpResponse.json(plannedEvent)
          : new HttpResponse(null, { status: 401 }),
      ),
      http.get(`${API_BASE}/athlete/0`, () =>
        HttpResponse.json({
          sportSettings: [
            {
              id: 1,
              types: ["Run"],
              lthr: 168,
              max_hr: 190,
              hr_zones: [120, 140, 160, 175, 190],
            },
          ],
        }),
      ),
      http.get(SMHI_URL, () =>
        HttpResponse.json({
          timeSeries: [
            {
              time: "2026-08-13T10:00:00.000Z",
              data: {
                air_temperature: 16,
                wind_speed: 2,
                wind_speed_of_gust: 4,
                precipitation_amount_mean: 0,
                predominant_precipitation_type_at_surface: 0,
              },
            },
          ],
        }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns server-derived planned detail", async () => {
    const { token } = await signMobileToken(EMAIL);
    const req = new Request("http://localhost/api/intervals/events/event-123", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const response = await GET(req, {
      params: Promise.resolve({ id: "event-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body)).toEqual([
      "event",
      "structure",
      "metrics",
      "preRunCarbsG",
      "clothing",
    ]);
    expect(body).toEqual({
      event: {
        id: "event-123",
        intervalsEventId: 123,
        startDateLocal: "2026-08-13T12:00:00",
        name: "W05 Easy",
        category: "easy",
        description,
      },
      structure: {
        sections: [
          {
            name: "Warmup",
            repeats: null,
            steps: [
              {
                label: null,
                duration: "10m",
                zone: "z2",
                detail: "114-128 bpm",
              },
            ],
          },
          {
            name: "Main set",
            repeats: null,
            steps: [
              {
                label: null,
                duration: "35m",
                zone: "z2",
                detail: "114-128 bpm",
              },
            ],
          },
          {
            name: "Cooldown",
            repeats: null,
            steps: [
              {
                label: null,
                duration: "15m",
                zone: "z2",
                detail: "114-128 bpm",
              },
            ],
          },
        ],
        timeline: [
          {
            durationMinutes: 10,
            intensityPercent: 72,
            zone: "z2",
            estimated: false,
          },
          {
            durationMinutes: 35,
            intensityPercent: 72,
            zone: "z2",
            estimated: false,
          },
          {
            durationMinutes: 15,
            intensityPercent: 72,
            zone: "z2",
            estimated: false,
          },
        ],
      },
      metrics: {
        duration: { minutes: 60, estimated: false },
        distance: { km: 8.3, estimated: true },
        fuelRateGPerHour: 60,
        prescribedCarbsG: 60,
      },
      preRunCarbsG: 25,
      clothing: {
        status: "available",
        recommendation: {
          upper: ["T-shirt"],
          lower: ["Shorts"],
          accessories: [],
          weather: {
            temp: 16,
            feelsLike: 16,
            windSpeed: 2,
            precipitation: 0,
            isRain: false,
            isSnow: false,
          },
        },
      },
    });
  });

  it("returns raw event without derived workout facts when calibration is absent", async () => {
    await holder.db.execute({
      sql: `UPDATE user_settings
            SET current_ability_dist = NULL, current_ability_secs = NULL,
                hr_zones = NULL, max_hr = NULL
            WHERE email = ?`,
      args: [EMAIL],
    });
    server.use(
      http.get(`${API_BASE}/athlete/0`, () => HttpResponse.json({})),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.event).toEqual({
      id: "event-123",
      intervalsEventId: 123,
      startDateLocal: "2026-08-13T12:00:00",
      name: "W05 Easy",
      category: "easy",
      description,
    });
    expect(result.body.structure).toEqual({ sections: [], timeline: [] });
    expect(result.body.metrics).toEqual({
      duration: null,
      distance: null,
      fuelRateGPerHour: 60,
      prescribedCarbsG: null,
    });
  });

  it("does not report clothing-domain failures as unavailable forecasts", async () => {
    await expect(
      buildPlannedWorkoutDetail({
        event: plannedEvent,
        lthr: 168,
        hrZones: [120, 140, 160, 175, 190],
        estimationContext: { thresholdPace: 5 },
        timezone: "Europe/Stockholm",
        warmthPreference: Symbol("invalid") as unknown as number,
        preRunCarbsG: 25,
      }),
    ).rejects.toThrow(TypeError);
  });

  it("keeps a supported unparseable workout usable without guessed metrics", async () => {
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({ ...plannedEvent, description: "Run easy." }),
      ),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.structure).toEqual({ sections: [], timeline: [] });
    expect(result.body.metrics).toEqual({
      duration: null,
      distance: null,
      fuelRateGPerHour: 60,
      prescribedCarbsG: null,
    });
  });

  it("maps an unknown but renderable workout name to other", async () => {
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({ ...plannedEvent, name: "Mystery Session" }),
      ),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.event.category).toBe("other");
    expect(result.body.structure.timeline).toHaveLength(3);
  });

  it("rejects an unknown workout name that cannot be rendered", async () => {
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({
          ...plannedEvent,
          name: "Mystery Session",
          description: "No prescription.",
        }),
      ),
    );

    const result = await requestDetail();

    expect(result.status).toBe(422);
    expect(result.body.code).toBe("UNSUPPORTED_EVENT");
  });

  it("returns outside-window without failing planned detail", async () => {
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({
          ...plannedEvent,
          start_date_local: "2026-08-20T12:00:00",
        }),
      ),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.clothing).toEqual({
      status: "unavailable",
      reason: "outside-window",
    });
  });

  it("keeps detail usable when SMHI fails", async () => {
    vi.setSystemTime(new Date("2026-09-10T10:00:00.000Z"));
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({
          ...plannedEvent,
          start_date_local: "2026-09-12T12:00:00",
        }),
      ),
      http.get(SMHI_URL, () => new HttpResponse(null, { status: 500 })),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.clothing).toEqual({
      status: "unavailable",
      reason: "forecast-unavailable",
    });
  });

  it("rejects an invalid event identity", async () => {
    const result = await requestDetail("activity-123");

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: "Invalid event ID",
      code: "INVALID_INPUT",
    });
  });

  it("maps a missing Intervals event to 404", async () => {
    server.use(
      http.get(EVENT_URL, () => new HttpResponse("missing", { status: 404 })),
    );

    const result = await requestDetail();

    expect(result.status).toBe(404);
    expect(result.body).toEqual({
      error: "Event not found",
      code: "EVENT_NOT_FOUND",
    });
  });

  it.each([
    ["non-workout", { category: "NOTE" }],
    ["paired", { paired_activity_id: "activity-123" }],
    ["non-run", { type: "Ride" }],
  ])("rejects a %s event as unsupported", async (_name, override) => {
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({ ...plannedEvent, ...override }),
      ),
    );

    const result = await requestDetail();

    expect(result.status).toBe(422);
    expect(result.body).toEqual({
      error: "Event is not a planned workout",
      code: "UNSUPPORTED_EVENT",
    });
  });

  it("maps an Intervals failure to 502", async () => {
    server.use(
      http.get(EVENT_URL, () => new HttpResponse("down", { status: 500 })),
    );

    const result = await requestDetail();

    expect(result.status).toBe(502);
    expect(result.body).toEqual({
      error: "Failed to fetch event",
      code: "UPSTREAM_ERROR",
    });
  });

  it("maps an Intervals network failure to 502", async () => {
    server.use(http.get(EVENT_URL, () => HttpResponse.error()));

    const result = await requestDetail();

    expect(result.status).toBe(502);
    expect(result.body).toEqual({
      error: "Failed to fetch event",
      code: "UPSTREAM_ERROR",
    });
  });

  it.each([
    {
      name: "CET -12h boundary",
      now: "2026-12-10T12:00:00.000Z",
      startDateLocal: "2026-12-10T01:00:00",
      forecastTime: "2026-12-10T00:00:00.000Z",
    },
    {
      name: "CEST +3d boundary",
      now: "2027-08-10T12:00:00.000Z",
      startDateLocal: "2027-08-13T14:00:00",
      forecastTime: "2027-08-13T12:00:00.000Z",
    },
  ])("includes exact weather window endpoint: $name", async (testCase) => {
    vi.setSystemTime(new Date(testCase.now));
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({
          ...plannedEvent,
          start_date_local: testCase.startDateLocal,
        }),
      ),
      http.get(SMHI_URL, () =>
        HttpResponse.json({
          timeSeries: [
            {
              time: testCase.forecastTime,
              data: {
                air_temperature: 16,
                wind_speed: 2,
                wind_speed_of_gust: 4,
                precipitation_amount_mean: 0,
                predominant_precipitation_type_at_surface: 0,
              },
            },
          ],
        }),
      ),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.clothing.status).toBe("available");
  });

  it.each([
    {
      name: "one second before -12h in CET",
      now: "2026-12-20T12:00:00.000Z",
      startDateLocal: "2026-12-20T00:59:59",
    },
    {
      name: "one second after +3d in CEST",
      now: "2027-08-20T12:00:00.000Z",
      startDateLocal: "2027-08-23T14:00:01",
    },
  ])("excludes weather outside endpoint: $name", async (testCase) => {
    vi.setSystemTime(new Date(testCase.now));
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({
          ...plannedEvent,
          start_date_local: testCase.startDateLocal,
        }),
      ),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.clothing).toEqual({
      status: "unavailable",
      reason: "outside-window",
    });
  });
});

async function requestDetail(id = "event-123") {
  const { token } = await signMobileToken(EMAIL);
  const response = await GET(
    new Request(`http://localhost/api/intervals/events/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({ id }) },
  );
  return {
    status: response.status,
    body: await response.json(),
  };
}
