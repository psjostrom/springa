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

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.AUTH_SECRET = "planned-mutation-mobile-auth-secret";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "22".repeat(32);
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

import { DELETE, PUT } from "@/app/api/intervals/events/[id]/route";
import { API_BASE } from "@/lib/constants";
import { encrypt } from "@/lib/credentials";
import { SCHEMA_DDL } from "@/lib/db";
import { signMobileToken } from "@/lib/mobileAuth";
import {
  cleanupOrphanedPreRunCarbs,
  getPreRunCarbs,
  savePreRunCarbs,
} from "@/lib/prerunCarbs";
import { MAX_CARBS_PER_HOUR } from "@/lib/fuelRate";
import {
  capturedDeleteEventIds,
  capturedPutPayload,
} from "./msw/handlers";
import { server } from "./msw/server";

const EMAIL = "native@example.com";
const originalUint8Array = globalThis.Uint8Array;
const nodeUint8Array = Object.getPrototypeOf(Buffer.prototype)
  .constructor as typeof Uint8Array;
let originalConsoleError: typeof console.error;

function putRequest(
  id: string,
  body: string,
  headers: HeadersInit = { "Content-Type": "application/json" },
) {
  return PUT(
    new Request(`http://localhost/api/intervals/events/${id}`, {
      method: "PUT",
      headers,
      body,
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function bearerPut(id: string, body: string) {
  holder.cookieEmail = null;
  const { token } = await signMobileToken(EMAIL);
  return putRequest(id, body, {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });
}

async function bearerDelete(id: string) {
  holder.cookieEmail = null;
  const { token } = await signMobileToken(EMAIL);
  return DELETE(
    new Request(`http://localhost/api/intervals/events/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({ id }) },
  );
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
  await holder.db.execute("DELETE FROM prerun_carbs");
  await holder.db.execute("DELETE FROM user_settings");
  await holder.db.execute({
    sql: `INSERT INTO user_settings (email, intervals_api_key, timezone)
          VALUES (?, ?, ?)`,
    args: [
      EMAIL,
      encrypt("intervals-key", process.env.CREDENTIALS_ENCRYPTION_KEY!),
      "Europe/Stockholm",
    ],
  });
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("planned workout move", () => {
  it("moves a canonical Bearer event with only its local start time", async () => {
    const response = await bearerPut(
      "event-123",
      JSON.stringify({ start_date_local: "2026-08-14T12:00:00" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(capturedPutPayload?.url).toContain("/events/123");
    expect(capturedPutPayload?.body).toEqual({
      start_date_local: "2026-08-14T12:00:00",
    });
  });

  it("returns a typed upstream error when a Bearer move fails", async () => {
    server.use(
      http.put(`${API_BASE}/athlete/0/events/:eventId`, () =>
        new HttpResponse("unavailable", { status: 503 }),
      ),
    );

    const response = await bearerPut(
      "event-123",
      JSON.stringify({ start_date_local: "2026-08-14T12:00:00" }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to update event",
      code: "UPSTREAM_ERROR",
    });
  });

  it("uses cookie payload contract when cookie and Bearer credentials coexist", async () => {
    holder.cookieEmail = EMAIL;
    const { token } = await signMobileToken(EMAIL);
    const response = await putRequest("123", JSON.stringify({ name: "Cookie update" }), {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    });

    expect(response.status).toBe(200);
    expect(capturedPutPayload?.body).toEqual({ name: "Cookie update" });
  });

  it.each([
    "0",
    "event-0",
    "01",
    "event-01",
    "-1",
    "1.5",
    "9007199254740992",
  ])("rejects non-canonical or unsafe move identity %p", async (id) => {
    const response = await bearerPut(
      id,
      JSON.stringify({ start_date_local: "2026-08-14T12:00:00" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(capturedPutPayload).toBeNull();
  });

  it("rejects invalid JSON before moving", async () => {
    const response = await bearerPut("event-123", "{");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(capturedPutPayload).toBeNull();
  });

  it.each([
    ["missing fields", {}],
    ["unknown field", { unknown: true }],
    [
      "allowed and unknown fields",
      { start_date_local: "2026-08-14T12:00:00", unknown: true },
    ],
    ["description", { description: "client-owned" }],
    ["name", { name: "client-owned" }],
    ["carbs", { carbs_per_hour: 60 }],
  ])("rejects Bearer move payload with %s", async (_name, body) => {
    const response = await bearerPut("event-123", JSON.stringify(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(capturedPutPayload).toBeNull();
  });

  it.each([
    "2026-08-14T12:00:00Z",
    "2026-08-14T12:00:00+02:00",
    "2026-02-30T12:00:00",
    "2026-08-14T24:00:00",
    "2026-08-14T12:00",
  ])("rejects invalid local move time %p", async (startDateLocal) => {
    const response = await bearerPut(
      "event-123",
      JSON.stringify({ start_date_local: startDateLocal }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(capturedPutPayload).toBeNull();
  });

  it("keeps cookie move fields and ignores unrelated legacy fields", async () => {
    holder.cookieEmail = EMAIL;
    const response = await putRequest(
      "123",
      JSON.stringify({
        start_date_local: "2026-08-14T12:00:00",
        name: "W06 Easy",
        description: "Updated workout",
        carbs_per_hour: 55,
        unrelated: true,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(capturedPutPayload?.body).toEqual({
      start_date_local: "2026-08-14T12:00:00",
      name: "W06 Easy",
      description: "Updated workout",
      carbs_per_hour: 55,
    });
  });

  it.each([
    ["start time", { start_date_local: "2026-02-30T12:00:00" }],
    ["name", { name: 12 }],
    ["description", { description: null }],
    ["carbs", { carbs_per_hour: "55" }],
    ["carbs above maximum", { carbs_per_hour: MAX_CARBS_PER_HOUR + 1 }],
  ])("validates supplied cookie move %s", async (_name, body) => {
    holder.cookieEmail = EMAIL;
    const response = await putRequest("123", JSON.stringify(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(capturedPutPayload).toBeNull();
  });
});

describe("planned workout effort metric", () => {
  const eventUrl = `${API_BASE}/athlete/0/events/123`;
  const baseEvent: {
    id: number;
    category: string;
    type: string;
    start_date_local: string;
    name: string;
    description: string;
    paired_activity_id: string | null;
    external_id?: string;
    carbs_per_hour: number;
  } = {
    id: 123,
    category: "WORKOUT",
    type: "Run",
    start_date_local: "2026-08-13T12:00:00",
    name: "W05 Easy",
    description: "Main set\n- Easy 30m 68-76% pace",
    paired_activity_id: null,
    carbs_per_hour: 60,
  };
  let providerWrites = 0;
  let providerBodies: unknown[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function installEffortEvent(
    overrides: Partial<typeof baseEvent> = {},
    profile: unknown = {
      sportSettings: [
        { types: ["Run"], lthr: 168, hr_zones: [120, 140, 160, 175, 190] },
      ],
    },
  ) {
    let currentEvent = { ...baseEvent, ...overrides };
    providerWrites = 0;
    providerBodies = [];
    server.use(
      http.get(eventUrl, () => HttpResponse.json(currentEvent)),
      http.get(`${API_BASE}/athlete/0`, () =>
        HttpResponse.json(profile as Record<string, unknown>),
      ),
      http.put(eventUrl, async ({ request }) => {
        providerWrites += 1;
        const body = await request.json();
        providerBodies.push(body);
        currentEvent = { ...currentEvent, ...(body as typeof currentEvent) };
        return HttpResponse.json({ ok: true });
      }),
    );
  }

  function descriptionFor(metric: "pace" | "hr" | "feel") {
    if (metric === "pace") return "Main set\n- Easy 30m 68-76% pace";
    if (metric === "hr") return "Main set\n- Easy 30m 68-76% LTHR (114-128 bpm)";
    return "Main set\n- Easy 30m";
  }

  it.each([
    ["pace", "hr"],
    ["hr", "feel"],
    ["feel", "pace"],
  ] as const)("changes %s to %s with one server-owned provider patch", async (from, to) => {
    installEffortEvent({ description: descriptionFor(from) });

    const response = await bearerPut(
      "event-123",
      JSON.stringify({ effortMetric: to }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      effortMetric: to,
      heartRateMetricAvailable: true,
      event: { id: "event-123", intervalsEventId: 123 },
      structure: expect.any(Object),
      metrics: expect.any(Object),
      clothing: expect.any(Object),
    });
    expect(providerWrites).toBe(1);
    expect(providerBodies).toHaveLength(1);
    expect(Object.keys(providerBodies[0] as object).sort()).toEqual([
      "description",
      "name",
    ]);
  });

  it("returns current detail without a provider patch for the same metric", async () => {
    installEffortEvent({ description: descriptionFor("hr") });

    const response = await bearerPut(
      "event-123",
      JSON.stringify({ effortMetric: "hr" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      effortMetric: "hr",
      event: { id: "event-123", description: descriptionFor("hr") },
    });
    expect(providerWrites).toBe(0);
  });

  it("fails closed when prose markers make candidate metric ambiguous", async () => {
    installEffortEvent({
      description: [
        "Notes mention 68-76% LTHR, but this workout is by feel.",
        "",
        "Main set",
        "- Easy 30m",
      ].join("\n"),
    });

    const response = await bearerPut(
      "event-123",
      JSON.stringify({ effortMetric: "pace" }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "UNSUPPORTED_EVENT",
    });
    expect(providerWrites).toBe(0);
  });

  it.each([
    {},
    { effortMetric: "power" },
    { metric: "hr" },
    { effortMetric: "hr", name: "client-owned" },
  ])("rejects invalid intent body %#", async (body) => {
    installEffortEvent();

    const response = await bearerPut("event-123", JSON.stringify(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_INPUT" });
    expect(providerWrites).toBe(0);
  });

  it("rejects malformed JSON without a provider patch", async () => {
    installEffortEvent();

    const response = await bearerPut("event-123", "{");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_INPUT" });
    expect(providerWrites).toBe(0);
  });

  it.each([
    ["past", { start_date_local: "2026-08-09T12:00:00" }],
    ["invalid calendar datetime", { start_date_local: "2026-12-32T12:00:00" }],
    ["paired", { paired_activity_id: "activity-123" }],
    ["race", { external_id: "race-2026-08-13" }],
    ["non-run", { type: "Ride" }],
    ["non-workout", { category: "NOTE" }],
  ] as const)("rejects %s events without a provider patch", async (_name, overrides) => {
    installEffortEvent(overrides);

    const response = await bearerPut(
      "event-123",
      JSON.stringify({ effortMetric: "hr" }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "UNSUPPORTED_EVENT",
    });
    expect(providerWrites).toBe(0);
  });

  it("rejects HR intent without live calibration", async () => {
    installEffortEvent({}, { sportSettings: [] });

    const response = await bearerPut(
      "event-123",
      JSON.stringify({ effortMetric: "hr" }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "PLAN_SETTINGS_REQUIRED",
      error: expect.stringMatching(/heart.?rate/i),
    });
    expect(providerWrites).toBe(0);
  });

  it("maps provider failures after validation to a typed upstream error", async () => {
    installEffortEvent();
    server.use(
      http.put(eventUrl, async () => {
        providerWrites += 1;
        return new HttpResponse("unavailable", { status: 503 });
      }),
    );

    const response = await bearerPut(
      "event-123",
      JSON.stringify({ effortMetric: "hr" }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to update event",
      code: "UPSTREAM_ERROR",
    });
    expect(providerWrites).toBe(1);
  });
});

describe("planned workout delete", () => {
  it("removes only confirmed orphaned pre-run carb rows and continues after failures", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);
    await savePreRunCarbs(EMAIL, 124, 25);
    server.use(
      http.get(`${API_BASE}/athlete/0/events/:eventId`, ({ params }) => {
        if (params.eventId === "123") {
          return new HttpResponse("unavailable", { status: 503 });
        }
        return new HttpResponse("missing", { status: 404 });
      }),
    );

    await cleanupOrphanedPreRunCarbs();

    expect(await getPreRunCarbs(EMAIL, 123)).toBe(25);
    expect(await getPreRunCarbs(EMAIL, 124)).toBeNull();
  });

  it("limits orphan cleanup to one batch per invocation", async () => {
    for (const eventId of Array.from({ length: 26 }, (_, index) => 1000 + index)) {
      await savePreRunCarbs(EMAIL, eventId, 25);
    }
    let checked = 0;
    server.use(
      http.get(`${API_BASE}/athlete/0/events/:eventId`, () => {
        checked += 1;
        return new HttpResponse("missing", { status: 404 });
      }),
    );

    await cleanupOrphanedPreRunCarbs();

    expect(checked).toBe(25);
    const remaining = await holder.db.execute(
      "SELECT COUNT(*) AS count FROM prerun_carbs",
    );
    expect(Number(remaining.rows[0].count)).toBe(1);
  });

  it("deletes upstream before removing local pre-run carbs", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);
    let carbsSeenUpstream: number | null | undefined;
    server.use(
      http.delete(
        `${API_BASE}/athlete/0/events/:eventId`,
        async () => {
          carbsSeenUpstream = await getPreRunCarbs(EMAIL, 123);
          return new HttpResponse(null, { status: 200 });
        },
      ),
    );

    const response = await bearerDelete("123");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(carbsSeenUpstream).toBe(25);
    expect(await getPreRunCarbs(EMAIL, 123)).toBeNull();
  });

  it("treats an upstream 404 as deleted and removes leftover carbs", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);
    server.use(
      http.delete(`${API_BASE}/athlete/0/events/:eventId`, () =>
        new HttpResponse("missing", { status: 404 }),
      ),
    );

    const response = await bearerDelete("event-123");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(await getPreRunCarbs(EMAIL, 123)).toBeNull();
  });

  it("preserves local carbs when upstream delete fails", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);
    server.use(
      http.delete(`${API_BASE}/athlete/0/events/:eventId`, () =>
        new HttpResponse("unavailable", { status: 500 }),
      ),
    );

    const response = await bearerDelete("event-123");

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
    expect(await getPreRunCarbs(EMAIL, 123)).toBe(25);
  });

  it("reports local cleanup failure after upstream delete succeeds", async () => {
    await holder.db.execute("DROP TABLE prerun_carbs");

    const response = await bearerDelete("event-123");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "LOCAL_CLEANUP_FAILED",
    });
    expect(capturedDeleteEventIds).toEqual(["123"]);
  });

  it("is safe to retry after the event was already deleted", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);
    let attempts = 0;
    server.use(
      http.delete(`${API_BASE}/athlete/0/events/:eventId`, () => {
        attempts += 1;
        return new HttpResponse(null, { status: attempts === 1 ? 200 : 404 });
      }),
    );

    const first = await bearerDelete("event-123");
    const retry = await bearerDelete("event-123");

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(attempts).toBe(2);
    expect(await getPreRunCarbs(EMAIL, 123)).toBeNull();
  });

  it.each(["0", "event-0", "01", "event-01", "-1", "1.5", "9007199254740992"])(
    "rejects non-canonical or unsafe delete identity %p",
    async (id) => {
      const response = await bearerDelete(id);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(capturedDeleteEventIds).toEqual([]);
    },
  );
});
