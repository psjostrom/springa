import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import type { Client } from "@libsql/client";
import type { CachedActivity } from "../activityStreamsDb";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  return { holder: { db: null as unknown as Client } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect, the one allowed exception
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

import { enrichActivitiesWithGlucose } from "../activityStreamsEnrich";
import { encrypt } from "../credentials";
import { SCHEMA_DDL } from "../db";
import { server } from "./msw/server";

const ENC_KEY = "a".repeat(64);
const EMAIL = "test@test.com";
const NS_URL = "https://ns.example.com";

function makeActivity(overrides: Partial<CachedActivity> = {}): CachedActivity {
  return {
    activityId: "act-1",
    category: "easy",
    fuelRate: 48,
    hr: [{ time: 0, value: 120 }, { time: 30, value: 130 }],
    runStartMs: 1000000,
    ...overrides,
  };
}

async function insertNSCredentials() {
  await holder.db.execute({
    sql: `INSERT INTO user_settings (email, nightscout_url, nightscout_secret, timezone)
          VALUES (?, ?, ?, ?)`,
    args: [EMAIL, NS_URL, encrypt("test-secret", ENC_KEY), "Europe/Stockholm"],
  });
}

describe("enrichActivitiesWithGlucose", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM user_settings");
  });

  it("returns empty array for empty activities", async () => {
    const result = await enrichActivitiesWithGlucose(EMAIL, []);
    expect(result).toHaveLength(0);
  });

  it("returns activities with empty glucose when no runStartMs", async () => {
    const acts = [makeActivity({ runStartMs: undefined })];
    const result = await enrichActivitiesWithGlucose(EMAIL, acts);
    expect(result[0].glucose).toBeUndefined();
  });

  it("fetches range based on activity timestamps and enriches", async () => {
    const startMs = 1_700_000_000_000;
    const acts = [
      makeActivity({
        activityId: "a1",
        runStartMs: startMs,
        hr: [{ time: 0, value: 120 }, { time: 30, value: 130 }],
      }),
    ];

    await insertNSCredentials();

    server.use(
      http.get(`${NS_URL}/api/v1/entries.json`, () => {
        return HttpResponse.json([
          { sgv: 180, date: startMs, direction: "Flat", delta: 0 },
          { sgv: 171, date: startMs + 5 * 60 * 1000, direction: "Flat", delta: 0 },
          { sgv: 144, date: startMs + 30 * 60 * 1000, direction: "Flat", delta: 0 },
        ]);
      }),
    );

    const result = await enrichActivitiesWithGlucose(EMAIL, acts);
    expect(result[0].glucose!.length).toBeGreaterThan(0);
  });

  it("excludes activities without runStartMs from maxMs calculation", async () => {
    const startMs = 1_700_000_000_000;
    const acts = [
      makeActivity({ activityId: "a1", runStartMs: startMs, hr: [{ time: 0, value: 120 }] }),
      makeActivity({ activityId: "a2", runStartMs: undefined, hr: [{ time: 0, value: 120 }] }),
    ];

    await insertNSCredentials();

    let capturedUrl: string | undefined;
    server.use(
      http.get(`${NS_URL}/api/v1/entries.json`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );

    await enrichActivitiesWithGlucose(EMAIL, acts);

    // Verify the fetch range is based on a1's startMs, not a2's undefined
    const url = new URL(capturedUrl!);
    const since = Number(url.searchParams.get("find[date][$gt]"));
    const until = Number(url.searchParams.get("find[date][$lt]"));
    expect(since).toBeGreaterThan(1_000_000_000_000);
    expect(until).toBeGreaterThan(1_000_000_000_000);
  });
});
