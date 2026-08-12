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
import { resetForecastCache } from "@/lib/smhi";
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
const paceDescription = [
  "Steady easy running.",
  "",
  "Warmup",
  "- 10m 68-76% pace",
  "",
  "Main set",
  "- 35m 68-76% pace",
  "",
  "Cooldown",
  "- 15m 68-76% pace",
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
  external_id: "ondemand-quality-2026-08-13",
};

const originalUint8Array = globalThis.Uint8Array;
const nodeUint8Array = Object.getPrototypeOf(Buffer.prototype)
  .constructor as typeof Uint8Array;

async function insertCachedPaceCalibration() {
  await holder.db.execute({
    sql: `INSERT INTO activity_streams
            (email, activity_id, name, hr, pace, activity_date)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      EMAIL,
      "activity-1",
      "W04 Easy",
      JSON.stringify([
        { time: 0, value: 130 },
        { time: 1, value: 130 },
        { time: 2, value: 130 },
      ]),
      JSON.stringify([
        { time: 0, value: 7 },
        { time: 1, value: 7 },
        { time: 2, value: 7 },
      ]),
      "2026-08-01",
    ],
  });
}

describe("GET /api/intervals/events/[id]", () => {
  beforeAll(async () => {
    // @libsql/client requires Node's Uint8Array realm; browser-realm values fail SQLite binding.
    globalThis.Uint8Array = nodeUint8Array;
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  afterAll(() => {
    globalThis.Uint8Array = originalUint8Array;
    vi.useRealTimers();
  });

  beforeEach(async () => {
    resetForecastCache();
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
    const result = await requestDetail();
    const { status, body } = result;

    expect(status).toBe(200);
    expect(Object.keys(body)).toEqual([
      "event",
      "replacementCategory",
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
      replacementCategory: "quality",
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

  it.each([
    ["easy-5-2", "easy"],
    ["free-5-4", "easy"],
    ["speed-5-4", "quality"],
    ["long-5", "long"],
    ["club-5-2", "club"],
    ["race", null],
  ])("resolves replacement intent from %s", async (externalId, expected) => {
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({ ...plannedEvent, external_id: externalId }),
      ),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.replacementCategory).toBe(expected);
  });

  it("derives pace prescriptions without HR profile calibration", async () => {
    await holder.db.execute({
      sql: `UPDATE user_settings
            SET hr_zones = NULL, max_hr = NULL
            WHERE email = ?`,
      args: [EMAIL],
    });
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({ ...plannedEvent, description: paceDescription }),
      ),
      http.get(`${API_BASE}/athlete/0`, () => HttpResponse.json({})),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.structure.sections).toMatchObject([
      { name: "Warmup", repeats: null, steps: [{ duration: "10m", zone: "z2" }] },
      { name: "Main set", repeats: null, steps: [{ duration: "35m", zone: "z2" }] },
      { name: "Cooldown", repeats: null, steps: [{ duration: "15m", zone: "z2" }] },
    ]);
    expect(result.body.structure.timeline).toEqual([
      { durationMinutes: 10, intensityPercent: 72, zone: "z2", estimated: false },
      { durationMinutes: 35, intensityPercent: 72, zone: "z2", estimated: false },
      { durationMinutes: 15, intensityPercent: 72, zone: "z2", estimated: false },
    ]);
    expect(result.body.metrics).toEqual({
      duration: { minutes: 60, estimated: false },
      distance: { km: 8.3, estimated: true },
      fuelRateGPerHour: 60,
      prescribedCarbsG: 60,
    });
  });

  it("derives HR structure and exact duration without pace calibration", async () => {
    await holder.db.execute({
      sql: `UPDATE user_settings
            SET current_ability_dist = NULL, current_ability_secs = NULL
            WHERE email = ?`,
      args: [EMAIL],
    });

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.structure.sections).toMatchObject([
      { name: "Warmup", repeats: null, steps: [{ duration: "10m", zone: "z2" }] },
      { name: "Main set", repeats: null, steps: [{ duration: "35m", zone: "z2" }] },
      { name: "Cooldown", repeats: null, steps: [{ duration: "15m", zone: "z2" }] },
    ]);
    expect(result.body.structure.timeline).toEqual([
      { durationMinutes: 10, intensityPercent: 72, zone: "z2", estimated: false },
      { durationMinutes: 35, intensityPercent: 72, zone: "z2", estimated: false },
      { durationMinutes: 15, intensityPercent: 72, zone: "z2", estimated: false },
    ]);
    expect(result.body.metrics).toEqual({
      duration: { minutes: 60, estimated: false },
      distance: null,
      fuelRateGPerHour: 60,
      prescribedCarbsG: 60,
    });
  });

  it("derives an exact-time free workout when notes mention LTHR", async () => {
    await holder.db.execute({
      sql: `UPDATE user_settings
            SET current_ability_dist = NULL, current_ability_secs = NULL,
                hr_zones = NULL, max_hr = NULL
            WHERE email = ?`,
      args: [EMAIL],
    });
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({
          ...plannedEvent,
          description: [
            "Notes mention 68-76% LTHR, but this workout is free-form.",
            "",
            "Main set",
            "- Free 60m intensity=active",
          ].join("\n"),
        }),
      ),
      http.get(`${API_BASE}/athlete/0`, () => HttpResponse.json({})),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.structure).toEqual({
      sections: [
        {
          name: "Main set",
          repeats: null,
          steps: [
            {
              label: "Free",
              duration: "60m",
              zone: "z2",
              detail: "",
            },
          ],
        },
      ],
      timeline: [
        {
          durationMinutes: 60,
          intensityPercent: 79,
          zone: "z2",
          estimated: false,
        },
      ],
    });
    expect(result.body.metrics).toEqual({
      duration: { minutes: 60, estimated: false },
      distance: null,
      fuelRateGPerHour: 60,
      prescribedCarbsG: null,
    });
  });

  it("returns exact distance for an HR all-km workout without pace calibration", async () => {
    await holder.db.execute({
      sql: `UPDATE user_settings
            SET current_ability_dist = NULL, current_ability_secs = NULL
            WHERE email = ?`,
      args: [EMAIL],
    });
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({
          ...plannedEvent,
          description: [
            "Warmup",
            "- 1km 68-76% LTHR (114-128 bpm)",
            "",
            "Main set",
            "- 4km 68-76% LTHR (114-128 bpm)",
            "",
            "Cooldown",
            "- 1km 68-76% LTHR (114-128 bpm)",
          ].join("\n"),
        }),
      ),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.structure.sections).toHaveLength(3);
    expect(result.body.structure.timeline).toHaveLength(3);
    expect(result.body.metrics).toEqual({
      duration: null,
      distance: { km: 6, estimated: false },
      fuelRateGPerHour: 60,
      prescribedCarbsG: null,
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
    await insertCachedPaceCalibration();
    let profileRequests = 0;
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({ ...plannedEvent, description: paceDescription }),
      ),
      http.get(`${API_BASE}/athlete/0`, () => {
        profileRequests += 1;
        return HttpResponse.json({});
      }),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.event).toEqual({
      id: "event-123",
      intervalsEventId: 123,
      startDateLocal: "2026-08-13T12:00:00",
      name: "W05 Easy",
      category: "easy",
      description: paceDescription,
    });
    expect(result.body.structure).toEqual({ sections: [], timeline: [] });
    expect(result.body.metrics).toEqual({
      duration: null,
      distance: null,
      fuelRateGPerHour: 60,
      prescribedCarbsG: null,
    });
    const settings = await holder.db.execute({
      sql: "SELECT hr_zones, max_hr FROM user_settings WHERE email = ?",
      args: [EMAIL],
    });
    expect(settings.rows[0]).toMatchObject({ hr_zones: null, max_hr: null });
    expect(profileRequests).toBe(1);
  });

  it("uses one live profile request for cached-stream calibration without persisting it", async () => {
    await holder.db.execute({
      sql: `UPDATE user_settings
            SET current_ability_dist = NULL, current_ability_secs = NULL,
                hr_zones = NULL, max_hr = NULL
            WHERE email = ?`,
      args: [EMAIL],
    });
    await insertCachedPaceCalibration();
    let profileRequests = 0;
    server.use(
      http.get(`${API_BASE}/athlete/0`, () => {
        profileRequests += 1;
        return HttpResponse.json({
          sportSettings: [
            { types: ["Run"], lthr: 168, max_hr: 190 },
          ],
        });
      }),
    );

    const result = await requestDetail();

    expect(result.status).toBe(200);
    expect(result.body.metrics).toEqual({
      duration: { minutes: 60, estimated: false },
      distance: { km: 8.6, estimated: true },
      fuelRateGPerHour: 60,
      prescribedCarbsG: 60,
    });
    const settings = await holder.db.execute({
      sql: "SELECT hr_zones, max_hr FROM user_settings WHERE email = ?",
      args: [EMAIL],
    });
    expect(settings.rows[0]).toMatchObject({ hr_zones: null, max_hr: null });
    expect(profileRequests).toBe(1);
  });

  it("returns typed 502 when the live profile is unavailable", async () => {
    let profileRequests = 0;
    server.use(
      http.get(`${API_BASE}/athlete/0`, () => {
        profileRequests += 1;
        return new HttpResponse("down", { status: 503 });
      }),
    );

    const result = await requestDetail();

    expect(result.status).toBe(502);
    expect(result.body).toEqual({
      error: "Failed to fetch athlete profile",
      code: "UPSTREAM_ERROR",
    });
    expect(profileRequests).toBe(1);
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

  it("rejects an unknown workout with an unparseable duration bullet", async () => {
    server.use(
      http.get(EVENT_URL, () =>
        HttpResponse.json({
          ...plannedEvent,
          name: "Mystery Session",
          description: "- Dance 10m nonsense",
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

  it("returns typed 400 when Intervals credentials are missing", async () => {
    await holder.db.execute({
      sql: "UPDATE user_settings SET intervals_api_key = NULL WHERE email = ?",
      args: [EMAIL],
    });

    const result = await requestDetail();

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: "Intervals.icu not configured",
      code: "MISSING_CREDENTIALS",
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

  it("maps malformed successful event JSON to 502", async () => {
    server.use(
      http.get(EVENT_URL, () => new HttpResponse("not-json", { status: 200 })),
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
