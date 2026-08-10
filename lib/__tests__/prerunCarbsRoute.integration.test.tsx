import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { Buffer } from "node:buffer";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.AUTH_SECRET = "test-mobile-auth-secret";
  return {
    holder: {
      db: null as unknown as Client,
      cookieEmail: "test@example.com" as string | null,
    },
  };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

// eslint-disable-next-line no-restricted-syntax -- auth boundary mock; returns a resolved promise, not a mock chain
vi.mock("@/lib/auth", () => ({
  auth: () =>
    Promise.resolve(
      holder.cookieEmail
        ? { user: { email: holder.cookieEmail }, expires: "" }
        : null,
    ),
}));

import { DELETE, GET, POST } from "@/app/api/prerun-carbs/route";
import { SCHEMA_DDL } from "../db";
import { signMobileToken } from "../mobileAuth";

let originalConsoleError: typeof console.error;
const originalUint8Array = globalThis.Uint8Array;
const nodeUint8Array = Object.getPrototypeOf(Buffer.prototype)
  .constructor as typeof Uint8Array;

describe("/api/prerun-carbs", () => {
  beforeAll(() => {
    globalThis.Uint8Array = nodeUint8Array;
  });

  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  afterAll(() => {
    globalThis.Uint8Array = originalUint8Array;
  });

  beforeEach(async () => {
    originalConsoleError = console.error;
    console.error = () => {};
    holder.cookieEmail = "test@example.com";
    await holder.db.executeMultiple(SCHEMA_DDL);
    await holder.db.execute("DELETE FROM prerun_carbs");
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/prerun-carbs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON" });
  });

  it("returns 500 when loading pre-run carbs fails", async () => {
    await holder.db.execute("DROP TABLE prerun_carbs");

    const res = await GET(new Request("http://localhost/api/prerun-carbs?eventId=123"));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to load pre-run carbs" });
  });

  it("returns 500 when saving pre-run carbs fails", async () => {
    await holder.db.execute("DROP TABLE prerun_carbs");

    const req = new Request("http://localhost/api/prerun-carbs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "123", carbsG: 25 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to save pre-run carbs" });
  });

  it("returns 500 when deleting pre-run carbs fails", async () => {
    await holder.db.execute("DROP TABLE prerun_carbs");

    const res = await DELETE(new Request("http://localhost/api/prerun-carbs?eventId=123", {
      method: "DELETE",
    }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to delete pre-run carbs" });
  });

  it("keeps cookie requests with numeric event IDs compatible", async () => {
    const saveResponse = await POST(new Request("http://localhost/api/prerun-carbs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "123", carbsG: 25 }),
    }));

    expect(saveResponse.status).toBe(200);
    await expect(saveResponse.json()).resolves.toEqual({ ok: true });

    const loadResponse = await GET(
      new Request("http://localhost/api/prerun-carbs?eventId=123"),
    );

    expect(loadResponse.status).toBe(200);
    await expect(loadResponse.json()).resolves.toEqual({ carbsG: 25 });
  });

  it("authenticates Bearer requests and stores canonical numeric event IDs", async () => {
    holder.cookieEmail = null;
    const { token } = await signMobileToken("native@example.com");
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const saveResponse = await POST(new Request("http://localhost/api/prerun-carbs", {
      method: "POST",
      headers,
      body: JSON.stringify({ eventId: "event-123", carbsG: 25 }),
    }));
    const loadResponse = await GET(new Request(
      "http://localhost/api/prerun-carbs?eventId=event-123",
      { headers },
    ));
    const stored = await holder.db.execute(
      "SELECT event_id FROM prerun_carbs ORDER BY event_id",
    );

    expect(saveResponse.status).toBe(200);
    await expect(saveResponse.json()).resolves.toEqual({ ok: true });
    await expect(loadResponse.json()).resolves.toEqual({ carbsG: 25 });
    expect(stored.rows.map((row) => row.event_id as string)).toEqual(["123"]);
  });

  it.each([
    ["negative", JSON.stringify({ eventId: "event-123", carbsG: -1 })],
    ["fractional", JSON.stringify({ eventId: "event-123", carbsG: 2.5 })],
    ["non-finite", '{"eventId":"event-123","carbsG":1e999}'],
    ["missing", JSON.stringify({ eventId: "event-123" })],
  ])("rejects %s carbs", async (_name, body) => {
    holder.cookieEmail = null;
    const { token } = await signMobileToken("native@example.com");
    const response = await POST(new Request("http://localhost/api/prerun-carbs", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("ignores unrelated fields in cookie POST payloads", async () => {
    const response = await POST(new Request("http://localhost/api/prerun-carbs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "123", carbsG: 25, extra: true }),
    }));
    const stored = await holder.db.execute(
      "SELECT event_id, carbs_g FROM prerun_carbs WHERE email = 'test@example.com'",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(stored.rows).toMatchObject([{ event_id: "123", carbs_g: 25 }]);
  });

  it.each(["activity-123", "", "01"])(
    "rejects invalid event identity %p before querying storage",
    async (eventId) => {
      const response = await GET(new Request(
        `http://localhost/api/prerun-carbs?eventId=${encodeURIComponent(eventId)}`,
      ));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: "INVALID_INPUT",
      });
    },
  );
});
