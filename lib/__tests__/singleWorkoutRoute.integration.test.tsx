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

import { POST } from "@/app/api/intervals/events/route";
import { GET } from "@/app/api/intervals/events/preview/route";
import { API_BASE } from "@/lib/constants";
import { encrypt } from "@/lib/credentials";
import { SCHEMA_DDL } from "@/lib/db";
import { signMobileToken } from "@/lib/mobileAuth";
import { getPreRunCarbs, savePreRunCarbs } from "@/lib/prerunCarbs";
import {
  capturedDeleteEventIds,
  capturedPutPayload,
  capturedUploadPayload,
} from "./msw/handlers";
import { server } from "./msw/server";

const EMAIL = "native-replacement@example.com";
const originalUint8Array = globalThis.Uint8Array;
const nodeUint8Array = Object.getPrototypeOf(Buffer.prototype)
  .constructor as typeof Uint8Array;
let originalConsoleError: typeof console.error;

async function preview(query = "date=2026-08-13&category=easy") {
  const { token } = await signMobileToken(EMAIL);
  return GET(new Request(`http://localhost/api/intervals/events/preview?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  }));
}

async function save(body: unknown) {
  const { token } = await signMobileToken(EMAIL);
  return POST(new Request("http://localhost/api/intervals/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
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
  useProfile();
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("single workout generation", () => {
  it.each([
    ["easy", "W01 Easy", "12:00:00"],
    ["quality", "W01 Short Intervals", "12:00:00"],
    ["long", "W01 Long (11km)", "12:00:00"],
    ["club", "W01 Club Run", "18:30:00"],
  ])("previews and saves %s without touching other events or local data", async (category, name, time) => {
    await savePreRunCarbs(EMAIL, 123, 25);
    const before = await holder.db.execute("SELECT * FROM user_settings");
    const response = await preview(`date=2026-08-13&category=${category}`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({date: "2026-08-13", category, suggestedCategory: "quality",
      workout: {name, startDateLocal: `2026-08-13T${time}`, metrics: {fuelRateGPerHour: 60}}});
    expect(data.previewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.workout).not.toHaveProperty("id");
    expect(data.workout.structure.sections.length).toBeGreaterThan(0);
    expectNoExternalMutation();
    const result = await save({date: data.date, category, previewHash: data.previewHash});
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({newId: 1000});
    expect(capturedUploadPayload).toEqual([{
      category: "WORKOUT", type: "Run", name,
      start_date_local: data.workout.startDateLocal, description: data.workout.description,
      external_id: `ondemand-${category}-2026-08-13`, carbs_per_hour: 60,
    }]);
    expect(capturedDeleteEventIds).toEqual([]);
    expect(capturedPutPayload).toBeNull();
    expect(await getPreRunCarbs(EMAIL, 123)).toBe(25);
    expect((await holder.db.execute("SELECT * FROM user_settings")).rows).toEqual(before.rows);
  });

  it("defaults to the plan suggestion", async () => {
    const response = await preview("date=2026-08-13");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({category: "quality", suggestedCategory: "quality"});
  });

  it("rejects a stale preview before saving", async () => {
    const data = await (await preview()).json();
    await holder.db.execute("UPDATE user_settings SET effort_metric = 'feel'");
    const response = await save({date: data.date, category: data.category, previewHash: data.previewHash});
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({code: "WORKOUT_PREVIEW_STALE"});
    expectNoExternalMutation();
  });

  it.each(["2026-02-30", "2026-2-01", "2026-08-13T12:00:00", "", "nonsense"])("rejects invalid date %s", async date => {
    const response = await preview(`date=${date}`);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({code: "INVALID_INPUT"});
    expectNoExternalMutation();
  });

  it.each(["date=2026-08-13&category=tempo", "date=2026-08-13&extra=x", "date=2026-08-13&date=2026-08-14", "date=2026-08-13&category=easy&category=long"])("rejects invalid query %s", async query => {
    expect((await preview(query)).status).toBe(400);
    expectNoExternalMutation();
  });

  it.each([
    null, [], {}, {date: "2026-08-13", category: "easy"},
    {date: "2026-08-13", category: "easy", previewHash: "x"},
    {date: "2026-08-13", category: "easy", previewHash: "a".repeat(64), workout: {}},
    {date: "2026-02-30", category: "easy", previewHash: "a".repeat(64)},
    {date: "2026-08-13", category: "tempo", previewHash: "a".repeat(64)},
  ])("rejects invalid save input %j", async body => {
    expect((await save(body)).status).toBe(400);
    expectNoExternalMutation();
  });

  it.each(["2026-08-09", "2026-11-02"])("rejects outside plan date %s", async date => {
    const response = await preview(`date=${date}`);
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({code: "DATE_OUTSIDE_PLAN"});
    expectNoExternalMutation();
  });

  it.each(["race_date", "total_weeks"])("requires %s", async column => {
    await holder.db.execute(`UPDATE user_settings SET ${column} = NULL`);
    const response = await preview();
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({code: "PLAN_SETTINGS_REQUIRED"});
    expectNoExternalMutation();
  });

  it("requires credentials", async () => {
    await holder.db.execute("UPDATE user_settings SET intervals_api_key = NULL");
    const response = await preview();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({code: "MISSING_CREDENTIALS"});
    expectNoExternalMutation();
  });

  it("reports athlete profile failures", async () => {
    server.use(http.get(`${API_BASE}/athlete/0`, () => new HttpResponse(null, {status: 503})));
    const response = await preview();
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({code: "UPSTREAM_ERROR"});
    expectNoExternalMutation();
  });

  it.each([
    ["pace", /\/km Pace/], ["hr", /% LTHR/], ["feel", /- 10m intensity=active/],
  ])("uses the %s effort setting", async (metric, pattern) => {
    await holder.db.execute({sql: "UPDATE user_settings SET effort_metric = ?", args: [metric]});
    const response = await preview();
    expect(response.status).toBe(200);
    expect((await response.json()).workout.description).toMatch(pattern);
  });

  it("sets zero fuel with diabetes mode off", async () => {
    await holder.db.execute("UPDATE user_settings SET diabetes_mode = 0");
    const data = await (await preview()).json();
    expect(data.workout.metrics.fuelRateGPerHour).toBe(0);
    expect((await save({date: data.date, category: data.category, previewHash: data.previewHash})).status).toBe(200);
    expect(capturedUploadPayload[0]).toMatchObject({carbs_per_hour: 0});
  });

  it("requires authentication for preview and save", async () => {
    expect((await GET(new Request("http://localhost/api/intervals/events/preview?date=2026-08-13"))).status).toBe(401);
    expect((await POST(new Request("http://localhost/api/intervals/events", {method: "POST"}))).status).toBe(401);
    expectNoExternalMutation();
  });

  it("accepts cookie authentication", async () => {
    holder.cookieEmail = EMAIL;
    const data = await (await GET(new Request("http://localhost/api/intervals/events/preview?date=2026-08-13"))).json();
    const response = await POST(new Request("http://localhost/api/intervals/events", {method: "POST", body: JSON.stringify({date: data.date, category: data.category, previewHash: data.previewHash})}));
    expect(response.status).toBe(200);
  });
  it("retries the same single-event upsert after an uncertain response", async () => {
    const data = await (await preview()).json();
    const events = new Map<string, Record<string, unknown>>();
    events.set("unrelated", {id: 123, name: "Untouched"});
    let failResponse = true;
    server.use(http.post(`${API_BASE}/athlete/0/events/bulk`, async ({ request }) => {
      expect(new URL(request.url).searchParams.get("upsert")).toBe("true");
      const payload = await request.json() as Record<string, unknown>[];
      expect(payload).toHaveLength(1);
      const event = payload[0];
      events.set(String(event.external_id), {...event, id: 1000});
      if (failResponse) {
        failResponse = false;
        return new HttpResponse(null, {status: 503});
      }
      return HttpResponse.json([{id: 1000}]);
    }));
    const input = {date: data.date, category: data.category, previewHash: data.previewHash};
    expect((await save(input)).status).toBe(502);
    const retry = await save(input);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual({newId: 1000});
    expect(events.size).toBe(2);
    expect(events.get("unrelated")).toEqual({id: 123, name: "Untouched"});
    expect(capturedDeleteEventIds).toEqual([]);
    expect(capturedPutPayload).toBeNull();
  });

  it.each([
    [undefined, "PLAN_SETTINGS_REQUIRED"],
    [0, "PLAN_SETTINGS_REQUIRED"],
  ])("rejects unavailable LTHR %s for heart-rate plans", async (lthr, code) => {
    await holder.db.execute("UPDATE user_settings SET effort_metric = 'hr'");
    useProfile({lthr});
    const response = await preview();
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({code});
    expectNoExternalMutation();
  });

  it("uses model fuel in preview and save", async () => {
    const points = Array.from({length: 20}, (_, time) => ({time, value: 10}));
    await holder.db.execute({
      sql: "INSERT INTO activity_streams (email, activity_id, name, fuel_rate, hr, glucose) VALUES (?, ?, ?, ?, ?, ?)",
      args: [EMAIL, "cached-quality", "W01 Short Intervals", 37,
        JSON.stringify(points.map(({time}) => ({time, value: 150}))), JSON.stringify(points)],
    });
    const data = await (await preview("date=2026-08-13&category=quality")).json();
    expect(data.workout.metrics.fuelRateGPerHour).toBe(37);
    expect((await save({date: data.date, category: data.category, previewHash: data.previewHash})).status).toBe(200);
    expect(capturedUploadPayload[0]).toMatchObject({carbs_per_hour: 37});
  });

  it("rejects malformed JSON", async () => {
    const {token} = await signMobileToken(EMAIL);
    const response = await POST(new Request("http://localhost/api/intervals/events", {
      method: "POST", headers: {Authorization: `Bearer ${token}`}, body: "{",
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({code: "INVALID_INPUT"});
    expectNoExternalMutation();
  });

});
