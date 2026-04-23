import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  return { holder: { db: null as unknown as Client } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

// eslint-disable-next-line no-restricted-syntax -- auth boundary mock; returns a resolved promise, not a mock chain
vi.mock("@/lib/auth", () => ({
  auth: () => Promise.resolve({ user: { email: "test@example.com" }, expires: "" }),
}));

import { DELETE, GET, POST } from "@/app/api/prerun-carbs/route";
import { SCHEMA_DDL } from "../db";

let originalConsoleError: typeof console.error;

describe("/api/prerun-carbs", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    originalConsoleError = console.error;
    console.error = () => {};
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
});