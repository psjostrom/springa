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

import { GET, PUT } from "@/app/api/bg-cache/route";
import { SCHEMA_DDL } from "../db";

let originalConsoleError: typeof console.error;

describe("/api/bg-cache", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    originalConsoleError = console.error;
    console.error = () => {};
    await holder.db.executeMultiple(SCHEMA_DDL);
    await holder.db.execute("DELETE FROM activity_streams");
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/bg-cache", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PUT(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when the payload is not an array", async () => {
    const req = new Request("http://localhost/api/bg-cache", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityId: "act-1" }),
    });

    const res = await PUT(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Expected an array of cached activities" });
  });

  it("returns 500 when loading the cache fails", async () => {
    await holder.db.execute("DROP TABLE activity_streams");

    const res = await GET();

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to load BG cache" });
  });

  it("returns 500 when saving the cache fails", async () => {
    await holder.db.execute("DROP TABLE activity_streams");

    const req = new Request("http://localhost/api/bg-cache", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ activityId: "act-1", category: "easy", fuelRate: null, hr: [] }]),
    });

    const res = await PUT(req);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to save BG cache" });
  });
});