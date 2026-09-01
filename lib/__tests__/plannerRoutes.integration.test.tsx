import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.AUTH_SECRET = "planner-route-auth-secret";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "b".repeat(64);
  return { holder: { db: null as unknown as Client, cookieEmail: null as string | null } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect, the one allowed exception
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

// eslint-disable-next-line no-restricted-syntax -- auth boundary; Bearer verification stays real
vi.mock("@/lib/auth", () => ({
  auth: () => Promise.resolve(
    holder.cookieEmail ? { user: { email: holder.cookieEmail }, expires: "" } : null,
  ),
}));

import { GET as plannerGet } from "@/app/api/planner/route";
import { POST as plannerPreview } from "@/app/api/planner/preview/route";
import { POST as plannerApply } from "@/app/api/planner/apply/route";
import { PUT as settingsPut } from "@/app/api/settings/route";
import { API_BASE } from "@/lib/constants";
import { encrypt } from "@/lib/credentials";
import { SCHEMA_DDL } from "@/lib/db";
import { PlannerError, type PlannerConfig } from "@/lib/plannerConfig";
import { getPlannerMetadata, savePlannerMetadata } from "@/lib/plannerMetadata";
import { POST as intervalsBulkPost } from "@/app/api/intervals/events/bulk/route";
import { getUserSettings } from "@/lib/settings";
import { signMobileToken } from "@/lib/mobileAuth";
import { plannerErrorResponse } from "@/app/api/planner/_helpers";
import { server } from "./msw/server";

const EMAIL = "planner-routes@example.com";
const API_KEY = "intervals-key";
const NOW = new Date("2026-08-25T12:00:00+02:00");
const CONFIG: PlannerConfig = {
  raceName: "Stockholm Half",
  raceDist: 21.1,
  raceDate: "2026-11-29",
  currentAbilityDist: 10,
  currentAbilitySecs: 3600,
  runDays: [0, 2, 4],
  longRunDay: 0,
  clubDay: null,
  clubType: null,
  totalWeeks: 14,
  startKm: 8,
  includeBasePhase: true,
  effortMetric: "pace",
};

const originalUint8Array = globalThis.Uint8Array;
const nodeUint8Array = Object.getPrototypeOf(Buffer.prototype).constructor as typeof Uint8Array;

function useProvider(events: unknown[] = []) {
  server.use(
    http.get(`${API_BASE}/athlete/0`, () =>
      HttpResponse.json({ sportSettings: [{ types: ["Run"], lthr: 160, max_hr: 190 }] })),
    http.get(`${API_BASE}/athlete/0/events`, () => HttpResponse.json(events)),
  );
}

async function seedSettings() {
  await holder.db.execute({
    sql: `INSERT INTO user_settings
      (email, intervals_api_key, race_name, race_date, race_dist, total_weeks, start_km,
       current_ability_dist, current_ability_secs, run_days, long_run_day, include_base_phase,
       effort_metric, timezone, diabetes_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      EMAIL,
      encrypt(API_KEY, process.env.CREDENTIALS_ENCRYPTION_KEY!),
      CONFIG.raceName,
      CONFIG.raceDate,
      CONFIG.raceDist,
      CONFIG.totalWeeks,
      CONFIG.startKm,
      CONFIG.currentAbilityDist,
      CONFIG.currentAbilitySecs,
      JSON.stringify(CONFIG.runDays),
      CONFIG.longRunDay,
      CONFIG.includeBasePhase ? 1 : 0,
      CONFIG.effortMetric,
      "Europe/Stockholm",
      0,
    ],
  });
}

function request(body?: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/planner", {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function bearerHeaders() {
  const { token } = await signMobileToken(EMAIL);
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  // jsdom's Uint8Array realm breaks SQLite setup and signMobileToken; swap before suite work.
  globalThis.Uint8Array = nodeUint8Array;
  await holder.db.executeMultiple(SCHEMA_DDL);
});

afterAll(() => {
  globalThis.Uint8Array = originalUint8Array;
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  holder.cookieEmail = null;
  await holder.db.execute("DELETE FROM activity_streams");
  await holder.db.execute("DELETE FROM user_settings");
  useProvider();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Planner routes", () => {
  it("falls back to HTTP 500 for an unmapped Planner error code", () => {
    const error = new PlannerError(
      "UNKNOWN_PLANNER_ERROR" as PlannerError["code"],
      "Unknown Planner error",
    );

    expect(plannerErrorResponse(error).status).toBe(500);
  });

  it("supports cookie and Bearer GET auth and rejects unauthenticated access", async () => {
    await seedSettings();
    holder.cookieEmail = EMAIL;
    expect((await plannerGet(request())).status).toBe(200);

    holder.cookieEmail = null;
    expect((await plannerGet(request(undefined, await bearerHeaders()))).status).toBe(200);

    const response = await plannerGet(request());
    expect(response.status).toBe(401);
  });

  it("returns public preview data and maps malformed input", async () => {
    await seedSettings();
    holder.cookieEmail = EMAIL;
    const response = await plannerPreview(
      new Request("http://localhost/api/planner/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "start", config: CONFIG }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ action: "replace-plan", intent: "start" });
    expect(body.previewHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body).not.toHaveProperty("operations");
    expect(body).not.toHaveProperty("generatedPlanConfig");

    const invalid = await plannerPreview(
      new Request("http://localhost/api/planner/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: "PLANNER_CONFIG_INVALID" });
  });

  it("applies a reviewed preview through Bearer auth", async () => {
    await seedSettings();
    holder.cookieEmail = EMAIL;
    const preview = await plannerPreview(
      new Request("http://localhost/api/planner/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "start", config: CONFIG }),
      }),
    );
    const previewBody = await preview.json();

    holder.cookieEmail = null;
    const response = await plannerApply(
      new Request("http://localhost/api/planner/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await bearerHeaders()) },
        body: JSON.stringify({ intent: "start", config: CONFIG, previewHash: previewBody.previewHash }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      action: "replace-plan",
      appliedWorkoutCount: expect.any(Number),
      warnings: [],
    });
  });

  it("returns a safe Google Calendar warning after a successful apply", async () => {
    await seedSettings();
    await holder.db.execute({
      sql: "UPDATE user_settings SET google_refresh_token = ?, google_calendar_id = ? WHERE email = ?",
      args: [
        encrypt("1//mock-refresh", process.env.CREDENTIALS_ENCRYPTION_KEY!),
        "existing-cal-id",
        EMAIL,
      ],
    });
    holder.cookieEmail = EMAIL;

    const preview = await plannerPreview(
      new Request("http://localhost/api/planner/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "start", config: CONFIG }),
      }),
    );
    const previewBody = await preview.json();

    server.use(
      http.post("https://oauth2.googleapis.com/token", () =>
        HttpResponse.json(
          { error: "invalid_grant", error_description: "Bad Request" },
          { status: 400 },
        )),
    );

    const response = await plannerApply(
      new Request("http://localhost/api/planner/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "start",
          config: CONFIG,
          previewHash: previewBody.previewHash,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      action: "replace-plan",
      appliedWorkoutCount: expect.any(Number),
      warnings: [{
        code: "GOOGLE_CALENDAR_SYNC_FAILED",
        message: "Google Calendar sync failed.",
      }],
    });
    expect(JSON.stringify(body)).not.toContain("invalid_grant");
    expect(JSON.stringify(body)).not.toContain("Bad Request");
  });

  it("validates complete Planner settings without storing sticky generation drift", async () => {
    await seedSettings();
    holder.cookieEmail = EMAIL;
    const changed = { ...CONFIG, startKm: 10 };
    const response = await settingsPut(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changed),
      }),
    );
    expect(response.status).toBe(200);
    expect(await getPlannerMetadata(EMAIL)).toMatchObject({ dirty: false });

    const raceNameOnly = await settingsPut(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceName: "New Name" }),
      }),
    );
    expect(raceNameOnly.status).toBe(200);
    expect(await getPlannerMetadata(EMAIL)).toMatchObject({ dirty: false });

    const invalid = await settingsPut(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceDist: 0 }),
      }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      code: "PLANNER_CONFIG_INVALID",
      fields: { raceDist: expect.any(String) },
    });
  });

  it("accepts and persists incomplete onboarding Planner settings", async () => {
    holder.cookieEmail = EMAIL;
    const response = await settingsPut(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Runner",
          runDays: [0, 2, 4],
          longRunDay: 0,
          effortMetric: "pace",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      incompletePlannerFields: [
        "raceDist",
        "raceDate",
        "currentAbilityDist",
        "currentAbilitySecs",
      ],
    });
    expect(await getUserSettings(EMAIL)).toMatchObject({
      displayName: "Runner",
      runDays: [0, 2, 4],
      longRunDay: 0,
      effortMetric: "pace",
    });
  });

  it("does not dirty metadata for an unchanged complete config", async () => {
    await seedSettings();
    holder.cookieEmail = EMAIL;
    await settingsPut(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(CONFIG),
      }),
    );
    expect(await getPlannerMetadata(EMAIL)).toMatchObject({ dirty: false });
  });

  it("leaves Planner metadata to the Planner apply flow", async () => {
    await seedSettings();
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: "stale-generated-config",
      dirty: true,
    });
    holder.cookieEmail = EMAIL;

    const response = await intervalsBulkPost(
      new Request("http://localhost/api/intervals/events/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [{
            start_date_local: "2026-09-01T12:00:00",
            name: "W01 Easy",
            description: "Easy run",
            external_id: "easy-2026-11-29-1-0",
            type: "Run",
          }],
          recordPlannerMetadata: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await getPlannerMetadata(EMAIL)).toEqual({
      generatedPlanConfig: "stale-generated-config",
      dirty: true,
    });
  });

  it("rejects heart-rate settings without live threshold context", async () => {
    await seedSettings();
    holder.cookieEmail = EMAIL;
    server.use(
      http.get(`${API_BASE}/athlete/0`, () =>
        HttpResponse.json({ sportSettings: [{ types: ["Run"], max_hr: 190 }] })),
    );

    const response = await settingsPut(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...CONFIG, effortMetric: "hr" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "PLANNER_CONFIG_INVALID",
      fields: { effortMetric: expect.stringContaining("Heart-rate zones") },
    });
    await expect((await plannerGet(request())).json()).resolves.toMatchObject({
      currentConfig: { effortMetric: "pace" },
    });
  });
});
