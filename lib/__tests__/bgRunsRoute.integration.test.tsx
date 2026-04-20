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

import { POST } from "@/app/api/bg/runs/route";
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

function makeRequest(windows: { activityId: string; start: number; end: number }[]) {
  return new Request("http://localhost/api/bg/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ windows }),
  });
}

describe("/api/bg/runs", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM user_settings");
  });

  it("returns readings partitioned by activityId", async () => {
    await insertCredentials();
    const w1Start = 1_700_000_000_000;
    const w1End = w1Start + 30 * 60 * 1000;
    const w2Start = w1End + 60 * 60 * 1000;
    const w2End = w2Start + 45 * 60 * 1000;

    server.use(
      http.get(`${NS_URL}/api/v1/entries.json`, () => {
        return HttpResponse.json([
          { sgv: 180, date: w1Start + 5 * 60 * 1000, direction: "Flat", delta: 0 },
          { sgv: 162, date: w2Start + 10 * 60 * 1000, direction: "Flat", delta: 0 },
        ]);
      }),
    );

    const res = await POST(makeRequest([
      { activityId: "act-1", start: w1Start, end: w1End },
      { activityId: "act-2", start: w2Start, end: w2End },
    ]));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.readings["act-1"]).toHaveLength(1);
    expect(json.readings["act-2"]).toHaveLength(1);
    expect(json.readings["act-1"][0].ts).toBeLessThan(w1End);
    expect(json.readings["act-2"][0].ts).toBeGreaterThanOrEqual(w2Start);
  });

  it("sorts readings ASC within each window", async () => {
    await insertCredentials();
    const start = 1_700_000_000_000;
    const end = start + 60 * 60 * 1000;

    server.use(
      http.get(`${NS_URL}/api/v1/entries.json`, () => {
        return HttpResponse.json([
          { sgv: 162, date: start + 10 * 60 * 1000, direction: "Flat", delta: 0 },
          { sgv: 180, date: start + 5 * 60 * 1000, direction: "Flat", delta: 0 },
        ]);
      }),
    );

    const res = await POST(makeRequest([
      { activityId: "act-1", start, end },
    ]));
    const json = await res.json();

    expect(json.readings["act-1"]).toHaveLength(2);
    expect(json.readings["act-1"][0].ts).toBeLessThan(json.readings["act-1"][1].ts);
  });

  it("returns 400 for missing windows", async () => {
    const req = new Request("http://localhost/api/bg/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty windows array", async () => {
    const res = await POST(makeRequest([]));
    expect(res.status).toBe(400);
  });

  it("returns empty readings when no NS credentials", async () => {
    await holder.db.execute({
      sql: `INSERT INTO user_settings (email, timezone) VALUES (?, ?)`,
      args: [EMAIL, "Europe/Stockholm"],
    });

    const res = await POST(makeRequest([
      { activityId: "act-1", start: 1000, end: 2000 },
    ]));
    const json = await res.json();
    expect(json.readings).toEqual({});
  });
});
