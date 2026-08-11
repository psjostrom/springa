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
import { getPreRunCarbs, savePreRunCarbs } from "@/lib/prerunCarbs";
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
      error: "Failed to update event: 503 unavailable",
      code: "UPSTREAM_ERROR",
    });
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

describe("planned workout delete", () => {
  it("deletes upstream before removing local pre-run carbs", async () => {
    await savePreRunCarbs(EMAIL, 123, 25);
    let carbsSeenUpstream: number | null = null;
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

  it.each(["0", "event-0", "01", "event-01", "9007199254740992"])(
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
