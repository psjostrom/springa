import { Buffer } from "node:buffer";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.AUTH_SECRET = "workout-replacement-mobile-auth-secret";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "33".repeat(32);
  return {
    holder: {
      db: null as unknown as Client,
      cookieEmail: null as string | null,
    },
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
  auth: () =>
    Promise.resolve(
      holder.cookieEmail
        ? { user: { email: holder.cookieEmail }, expires: "" }
        : null,
    ),
}));

import { POST } from "@/app/api/intervals/events/replace/route";
import { API_BASE } from "@/lib/constants";
import { encrypt } from "@/lib/credentials";
import { SCHEMA_DDL } from "@/lib/db";
import { signMobileToken } from "@/lib/mobileAuth";
import { getPreRunCarbs, savePreRunCarbs } from "@/lib/prerunCarbs";
import {
  capturedDeleteEventIds,
  capturedPutPayload,
  capturedUploadPayload,
  resetCaptures,
} from "./msw/handlers";
import { server } from "./msw/server";

const EMAIL = "native-replacement@example.com";
const originalUint8Array = globalThis.Uint8Array;
const nodeUint8Array = Object.getPrototypeOf(Buffer.prototype)
  .constructor as typeof Uint8Array;
let originalConsoleError: typeof console.error;

async function bearerPostRaw(body: string) {
  holder.cookieEmail = null;
  const { token } = await signMobileToken(EMAIL);
  return POST(
    new Request("http://localhost/api/intervals/events/replace", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    }),
  );
}

async function bearerPost(body: unknown) {
  return bearerPostRaw(JSON.stringify(body));
}

function cookiePost(body: unknown) {
  holder.cookieEmail = EMAIL;
  return POST(
    new Request("http://localhost/api/intervals/events/replace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function useEvent(overrides: Record<string, unknown> = {}) {
  server.use(
    http.get(`${API_BASE}/athlete/0/events/:eventId`, ({ params }) =>
      params.eventId === "123"
        ? HttpResponse.json({
            id: 123,
            category: "WORKOUT",
            type: "Run",
            start_date_local: "2026-08-13T07:15:00",
            name: "Client-era workout",
            description: "Client-era description",
            ...overrides,
          })
        : new HttpResponse(null, { status: 404 }),
    ),
  );
}

function useProfile(overrides: Record<string, unknown> = {}) {
  server.use(
    http.get(`${API_BASE}/athlete/0`, () =>
      HttpResponse.json({
        id: 0,
        sportSettings: [{
          id: 7,
          types: ["Run"],
          lthr: 168,
          max_hr: 200,
          hr_zones: [1, 2, 3, 4, 5],
          ...overrides,
        }],
      }),
    ),
  );
}

function expectNoExternalMutation() {
  expect(capturedUploadPayload).toEqual([]);
  expect(capturedDeleteEventIds).toEqual([]);
  expect(capturedPutPayload).toBeNull();
}

beforeAll(async () => {
  globalThis.Uint8Array = nodeUint8Array;
  await holder.db.executeMultiple(SCHEMA_DDL);
});

afterAll(() => {
  globalThis.Uint8Array = originalUint8Array;
});

beforeEach(async () => {
  originalConsoleError = console.error;
  console.error = () => {};
  holder.cookieEmail = null;
  await holder.db.executeMultiple(SCHEMA_DDL);
  await holder.db.execute("DELETE FROM activity_streams");
  await holder.db.execute("DELETE FROM prerun_carbs");
  await holder.db.execute("DELETE FROM user_settings");
  await holder.db.execute({
    sql: `INSERT INTO user_settings (
            email, intervals_api_key, race_date, race_dist, total_weeks,
            start_km, include_base_phase, diabetes_mode, run_days,
            long_run_day, current_ability_secs, current_ability_dist,
            effort_metric, hr_zones, max_hr, timezone
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      EMAIL,
      encrypt("intervals-key", process.env.CREDENTIALS_ENCRYPTION_KEY!),
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
      JSON.stringify([10, 20, 30, 40, 50]),
      99,
      "Europe/Stockholm",
    ],
  });
  useEvent();
  useProfile();
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("Bearer workout replacement", () => {
  it("generates replacement server-side and resets pre-run carbs after PUT", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "quality",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ newId: 123 });
    expect(capturedUploadPayload).toEqual([]);
    expect(capturedDeleteEventIds).toEqual([]);
    expect(capturedPutPayload?.url).toContain("/events/123");
    expect(capturedPutPayload?.body).toMatchObject({
      name: "W01 Short Intervals",
      external_id: "ondemand-2026-08-13",
      type: "Run",
      carbs_per_hour: 60,
    });
    expect(
      String(
        (capturedPutPayload?.body as Record<string, unknown>).start_date_local,
      ).slice(0, 10),
    ).toBe("2026-08-13");
    expect(capturedPutPayload?.body).toHaveProperty("description");
    expect(await getPreRunCarbs(EMAIL, 123)).toBeNull();
  });

  it.each([
    ["easy", "W01 Easy", "12:00:00"],
    ["quality", "W01 Short Intervals", "12:00:00"],
    ["long", "W01 Long (11km)", "12:00:00"],
    ["club", "W01 Club Run", "18:30:00"],
  ])("generates %s with server-owned category semantics", async (
    category,
    name,
    localTime,
  ) => {
    const response = await bearerPost({
      existingEventId: "event-123",
      category,
    });

    expect(response.status).toBe(200);
    expect(capturedPutPayload?.body).toMatchObject({
      name,
      start_date_local: `2026-08-13T${localTime}`,
      external_id: "ondemand-2026-08-13",
      type: "Run",
    });
  });

  it.each([
    ["pace", /\/km Pace/, /% LTHR/],
    ["hr", /70-93% LTHR \(117-156 bpm\)/, /\/km Pace/],
    ["feel", /intensity=active/, /\/km Pace|% pace|% LTHR/],
  ])("uses stored %s effort metric with live LTHR and computed max-HR zones", async (
    effortMetric,
    included,
    excluded,
  ) => {
    await holder.db.execute({
      sql: "UPDATE user_settings SET effort_metric = ? WHERE email = ?",
      args: [effortMetric, EMAIL],
    });

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });

    expect(response.status).toBe(200);
    const description = String(
      (capturedPutPayload?.body as Record<string, unknown>).description,
    );
    expect(description).toMatch(included);
    expect(description).not.toMatch(excluded);
  });

  it("falls back to DEFAULT_MAX_HR when live max HR is absent", async () => {
    await holder.db.execute({
      sql: "UPDATE user_settings SET effort_metric = 'hr' WHERE email = ?",
      args: [EMAIL],
    });
    useProfile({ max_hr: undefined });

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });

    expect(response.status).toBe(200);
    expect(
      String(
        (capturedPutPayload?.body as Record<string, unknown>).description,
      ),
    ).toMatch(/67-88% LTHR \(112-147 bpm\)/);
  });

  it("omits fuel when diabetes mode is off", async () => {
    await holder.db.execute({
      sql: "UPDATE user_settings SET diabetes_mode = 0 WHERE email = ?",
      args: [EMAIL],
    });
    await holder.db.execute({
      sql: `INSERT INTO activity_streams
              (email, activity_id, name, fuel_rate, hr, glucose)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [EMAIL, "ignored", "W01 Easy", 99, "not-json", "not-json"],
    });

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "quality",
    });

    expect(response.status).toBe(200);
    expect(capturedPutPayload?.body).toMatchObject({ carbs_per_hour: 0 });
  });

  it("uses default fuel with diabetes on and no cached rows", async () => {
    const response = await bearerPost({
      existingEventId: "event-123",
      category: "quality",
    });

    expect(response.status).toBe(200);
    expect(capturedPutPayload?.body).toMatchObject({ carbs_per_hour: 60 });
  });

  it("uses the BG model built from cached rows when diabetes mode is on", async () => {
    const points = Array.from({ length: 20 }, (_, time) => ({
      time,
      value: 10,
    }));
    await holder.db.execute({
      sql: `INSERT INTO activity_streams
              (email, activity_id, name, fuel_rate, hr, glucose)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        EMAIL,
        "cached-quality",
        "W01 Short Intervals",
        37,
        JSON.stringify(points.map(({ time }) => ({ time, value: 150 }))),
        JSON.stringify(points),
      ],
    });

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "quality",
    });

    expect(response.status).toBe(200);
    expect(capturedPutPayload?.body).toMatchObject({ carbs_per_hour: 37 });
  });

  it.each(["race_date", "total_weeks"])(
    "returns PLAN_SETTINGS_REQUIRED when %s is absent",
    async (column) => {
      await holder.db.execute(
        `UPDATE user_settings SET ${column} = NULL WHERE email = '${EMAIL}'`,
      );
      await holder.db.execute({
        sql: `INSERT INTO activity_streams
                (email, activity_id, name, fuel_rate, hr, glucose)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          EMAIL,
          `malformed-${column}`,
          "W01 Easy",
          60,
          "not-json",
          "not-json",
        ],
      });

      const response = await bearerPost({
        existingEventId: "event-123",
        category: "easy",
      });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        code: "PLAN_SETTINGS_REQUIRED",
      });
      expectNoExternalMutation();
    },
  );

  it("returns PLAN_SETTINGS_REQUIRED when live running LTHR is absent", async () => {
    useProfile({ lthr: undefined });

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "PLAN_SETTINGS_REQUIRED",
    });
    expectNoExternalMutation();
  });

  it.each([
    ["5xx", () => new HttpResponse("unavailable", { status: 503 })],
    ["network failure", () => HttpResponse.error()],
  ])("returns UPSTREAM_ERROR when athlete profile has a %s", async (
    _name,
    response,
  ) => {
    server.use(
      http.get(`${API_BASE}/athlete/0`, response),
    );

    const result = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });

    expect(result.status).toBe(502);
    await expect(result.json()).resolves.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
    expectNoExternalMutation();
  });

  it("returns DATE_OUTSIDE_PLAN for a target outside the stored plan", async () => {
    useEvent({ start_date_local: "2025-08-13T07:15:00" });

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "DATE_OUTSIDE_PLAN",
    });
    expectNoExternalMutation();
  });

  it("returns EVENT_NOT_FOUND when the target is missing", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/events/:eventId`, () =>
        new HttpResponse("missing", { status: 404 }),
      ),
    );

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
    expectNoExternalMutation();
  });

  it.each([
    ["non-workout category", { category: "NOTE" }],
    ["non-run workout", { type: "Ride" }],
    ["paired workout", { paired_activity_id: "activity-1" }],
  ])("returns UNSUPPORTED_EVENT for %s", async (_name, overrides) => {
    useEvent(overrides);

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "UNSUPPORTED_EVENT",
    });
    expectNoExternalMutation();
  });

  it("maps an upstream event failure without mutating", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/events/:eventId`, () =>
        new HttpResponse("unavailable", { status: 503 }),
      ),
    );

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
    expectNoExternalMutation();
  });

  it.each([
    ["missing ID", { category: "easy" }],
    ["non-canonical ID", { existingEventId: "event-01", category: "easy" }],
    ["zero ID", { existingEventId: 0, category: "easy" }],
    ["unknown category", { existingEventId: "event-123", category: "tempo" }],
    ["missing category", { existingEventId: "event-123" }],
    [
      "unknown field",
      { existingEventId: "event-123", category: "easy", unknown: true },
    ],
  ])("rejects Bearer intent with %s", async (_name, body) => {
    const response = await bearerPost(body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_INPUT",
    });
    expectNoExternalMutation();
  });

  it.each([
    [
      "legacy workout",
      {
        existingEventId: "event-123",
        workout: {
          name: "Client output",
          description: "Client output",
          fuelRate: 999,
        },
      },
    ],
    [
      "description",
      {
        existingEventId: "event-123",
        category: "easy",
        description: "client output",
      },
    ],
    [
      "fuel rate",
      { existingEventId: "event-123", category: "easy", fuelRate: 999 },
    ],
  ])("rejects Bearer client-owned %s before mutation", async (_name, body) => {
    const response = await bearerPost(body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_INPUT",
    });
    expectNoExternalMutation();
  });

  it("rejects malformed Bearer JSON before mutation", async () => {
    const response = await bearerPostRaw("{");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_INPUT",
    });
    expectNoExternalMutation();
  });

  it("preserves pre-run carbs when generated PUT fails", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);
    server.use(
      http.put(`${API_BASE}/athlete/0/events/:eventId`, () =>
        new HttpResponse("unavailable", { status: 503 }),
      ),
    );

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
    expect(await getPreRunCarbs(EMAIL, 123)).toBe(25);
    expect(capturedUploadPayload).toEqual([]);
    expect(capturedDeleteEventIds).toEqual([]);
  });

  it("reports LOCAL_CLEANUP_FAILED after a successful generated PUT", async () => {
    await holder.db.execute("DROP TABLE prerun_carbs");

    const response = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "LOCAL_CLEANUP_FAILED",
    });
    expect(capturedPutPayload?.url).toContain("/events/123");
    expect(capturedUploadPayload).toEqual([]);
    expect(capturedDeleteEventIds).toEqual([]);
  });

  it("keeps cleanup retry-safe after the generated PUT succeeded", async () => {
    await holder.db.execute("DROP TABLE prerun_carbs");
    const first = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });
    expect(first.status).toBe(500);

    await holder.db.executeMultiple(SCHEMA_DDL);
    resetCaptures();
    const retry = await bearerPost({
      existingEventId: "event-123",
      category: "easy",
    });

    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual({ newId: 123 });
    expect(capturedPutPayload?.url).toContain("/events/123");
    expect(capturedUploadPayload).toEqual([]);
    expect(capturedDeleteEventIds).toEqual([]);
  });
});

describe("legacy cookie workout replacement", () => {
  const workout = {
    start_date_local: "2026-08-13T12:00:00",
    name: "W01 Easy",
    description: "Legacy generated workout",
    external_id: "ondemand-2026-08-13",
    type: "Run",
    fuelRate: 48,
  };

  it("keeps existing-ID request and response compatible with in-place PUT", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);

    const response = await cookiePost({ existingEventId: 123, workout });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ newId: 123 });
    expect(capturedPutPayload?.url).toContain("/events/123");
    expect(capturedPutPayload?.body).toEqual({
      start_date_local: "2026-08-13T12:00:00",
      name: "W01 Easy",
      description: "Legacy generated workout",
      external_id: "ondemand-2026-08-13",
      type: "Run",
      carbs_per_hour: 48,
    });
    expect(capturedUploadPayload).toEqual([]);
    expect(capturedDeleteEventIds).toEqual([]);
    expect(await getPreRunCarbs(EMAIL, 123)).toBeNull();
  });

  it("preserves pre-run carbs when legacy same-ID PUT fails", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);
    server.use(
      http.put(`${API_BASE}/athlete/0/events/:eventId`, () =>
        new HttpResponse("unavailable", { status: 503 }),
      ),
    );

    const response = await cookiePost({ existingEventId: 123, workout });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
    expect(await getPreRunCarbs(EMAIL, 123)).toBe(25);
    expect(capturedUploadPayload).toEqual([]);
    expect(capturedDeleteEventIds).toEqual([]);
  });

  it("reports legacy cleanup failure and succeeds on retry", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);
    await holder.db.execute(
      "ALTER TABLE prerun_carbs RENAME TO prerun_carbs_blocked",
    );

    let first: Response;
    try {
      first = await cookiePost({ existingEventId: 123, workout });
    } finally {
      await holder.db.execute(
        "ALTER TABLE prerun_carbs_blocked RENAME TO prerun_carbs",
      );
    }

    expect(first.status).toBe(500);
    await expect(first.json()).resolves.toMatchObject({
      code: "LOCAL_CLEANUP_FAILED",
    });
    expect(await getPreRunCarbs(EMAIL, 123)).toBe(25);
    expect(capturedPutPayload?.url).toContain("/events/123");
    expect(capturedUploadPayload).toEqual([]);
    expect(capturedDeleteEventIds).toEqual([]);

    resetCaptures();
    const retry = await cookiePost({ existingEventId: 123, workout });

    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual({ newId: 123 });
    expect(await getPreRunCarbs(EMAIL, 123)).toBeNull();
    expect(capturedPutPayload?.url).toContain("/events/123");
    expect(capturedUploadPayload).toEqual([]);
    expect(capturedDeleteEventIds).toEqual([]);
  });

  it("keeps no-ID bulk create behavior unchanged", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);

    const response = await cookiePost({ workout });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ newId: 1000 });
    expect(capturedUploadPayload).toEqual([{
      category: "WORKOUT",
      start_date_local: "2026-08-13T12:00:00",
      name: "W01 Easy",
      description: "Legacy generated workout",
      external_id: "ondemand-2026-08-13",
      type: "Run",
      carbs_per_hour: 48,
    }]);
    expect(capturedPutPayload).toBeNull();
    expect(capturedDeleteEventIds).toEqual([]);
    expect(await getPreRunCarbs(EMAIL, 123)).toBe(25);
  });
});
