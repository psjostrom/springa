import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  return { holder: { db: null as unknown as Client } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

const EMAIL = "test@test.com";

// eslint-disable-next-line no-restricted-syntax -- auth boundary mock; returns a resolved promise, not a mock chain
vi.mock("@/lib/auth", () => ({
  auth: () => Promise.resolve({ user: { email: EMAIL }, expires: "" }),
}));

import { GET } from "@/app/api/bg/run/route";
import { encrypt } from "../credentials";
import { SCHEMA_DDL } from "../db";
import { server } from "./msw/server";

const ENC_KEY = "a".repeat(64);
const NS_URL = "https://ns.example.com";

async function insertCredentials() {
  await holder.db.execute({
    sql: `INSERT INTO user_settings (email, nightscout_url, nightscout_secret, timezone)
          VALUES (?, ?, ?, ?)`,
    args: [EMAIL, NS_URL, encrypt("secret", ENC_KEY), "Europe/Stockholm"],
  });
}

describe("/api/bg/run", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM user_settings");
  });

  it("returns readings for a time window", async () => {
    await insertCredentials();
    const startMs = 1_700_000_000_000;
    const endMs = startMs + 60 * 60 * 1000;

    // Return DESC (newest first) — route must sort to ASC
    server.use(
      http.get(`${NS_URL}/api/v1/entries.json`, () => {
        return HttpResponse.json([
          { sgv: 162, date: startMs + 10 * 60 * 1000, direction: "Flat", delta: 0 },
          { sgv: 180, date: startMs + 5 * 60 * 1000, direction: "Flat", delta: 0 },
        ]);
      }),
    );

    const req = new Request(`http://localhost/api/bg/run?start=${startMs}&end=${endMs}`);
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.readings).toHaveLength(2);
    expect(json.readings[0].mmol).toBeGreaterThan(0);
    // Verify ASC sort (oldest first) — critical for interpolateBG/alignHRWithBG
    expect(json.readings[0].ts).toBeLessThan(json.readings[1].ts);
  });

  it("returns 400 for missing params", async () => {
    const req = new Request("http://localhost/api/bg/run");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when start >= end", async () => {
    const req = new Request("http://localhost/api/bg/run?start=2000&end=1000");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns empty readings when no NS credentials", async () => {
    await holder.db.execute({
      sql: `INSERT INTO user_settings (email, timezone) VALUES (?, ?)`,
      args: [EMAIL, "Europe/Stockholm"],
    });

    const req = new Request("http://localhost/api/bg/run?start=1000&end=2000");
    const res = await GET(req);
    const json = await res.json();
    expect(json.readings).toEqual([]);
  });
});
