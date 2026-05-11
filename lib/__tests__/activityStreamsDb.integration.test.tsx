import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
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

import { getActivityStreams, saveActivityStreams } from "../activityStreamsDb";
import type { CachedActivity } from "../activityStreamsDb";
import { SCHEMA_DDL } from "../db";

const EMAIL = "test@test.com";

describe("activityStreamsDb glucose persistence", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM activity_streams");
    await holder.db.execute("DELETE FROM user_settings");
  });

  it("round-trips glucose through save and get", async () => {
    const glucose = [
      { time: 0, value: 8.5 },
      { time: 5, value: 7.2 },
      { time: 10, value: 6.8 },
    ];

    const activity: CachedActivity = {
      activityId: "act-1",
      name: "Easy Run",
      category: "easy",
      fuelRate: 48,
      hr: [{ time: 0, value: 120 }],
      activityDate: "2026-04-15",
      runStartMs: 1_700_000_000_000,
      glucose,
    };

    await saveActivityStreams(EMAIL, [activity]);
    const loaded = await getActivityStreams(EMAIL);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].glucose).toEqual(glucose);
  });

  it("returns undefined glucose for rows without glucose data", async () => {
    const activity: CachedActivity = {
      activityId: "act-2",
      category: "easy",
      fuelRate: 48,
      hr: [{ time: 0, value: 120 }],
    };

    await saveActivityStreams(EMAIL, [activity]);
    const loaded = await getActivityStreams(EMAIL);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].glucose).toBeUndefined();
  });
});

describe("getActivityStreams computes runBGContext on read", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
    // bg_readings is not in SCHEMA_DDL (managed by Scout/Strimma in production);
    // create it here so the read path can query without throwing.
    await holder.db.execute(
      `CREATE TABLE IF NOT EXISTS bg_readings (
        email TEXT NOT NULL,
        ts INTEGER NOT NULL,
        mmol REAL NOT NULL,
        PRIMARY KEY (email, ts)
      )`,
    );
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM activity_streams");
    await holder.db.execute("DELETE FROM user_settings");
    await holder.db.execute("DELETE FROM bg_readings");
  });

  it("returns null runBGContext when bg_readings has no data for the window", async () => {
    // Save an activity with no bg_readings present. Recompute returns null;
    // the read path surfaces null without crashing.
    await saveActivityStreams(EMAIL, [
      {
        activityId: "act-no-bg",
        name: "Easy Run",
        category: "easy",
        fuelRate: 48,
        hr: [
          { time: 0, value: 120 },
          { time: 30, value: 145 },
        ],
        runStartMs: 1_700_000_000_000,
        activityDate: "2026-04-15",
      },
    ]);

    const loaded = await getActivityStreams(EMAIL);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].runBGContext).toBeNull();
  });

  it("computes runBGContext from bg_readings on read (not from a stored column)", async () => {
    // Seed bg_readings around a 30-minute run window with a clear declining trend.
    const runStartMs = 1_700_000_000_000;
    const runDurationMin = 30;
    const runEndMs = runStartMs + runDurationMin * 60_000;
    const fiveMinMs = 5 * 60_000;

    // 60 min before through 2h after, sample every 5 min, declining BG.
    const readings: { ts: number; mmol: number }[] = [];
    for (let ts = runStartMs - 60 * 60_000; ts <= runEndMs + 2 * 60 * 60_000; ts += fiveMinMs) {
      const elapsedMin = (ts - runStartMs) / 60_000;
      const mmol = 8.0 - 0.05 * elapsedMin;
      readings.push({ ts, mmol: Math.max(4.0, mmol) });
    }
    for (const r of readings) {
      await holder.db.execute({
        sql: "INSERT INTO bg_readings (email, ts, mmol) VALUES (?, ?, ?)",
        args: [EMAIL, r.ts, r.mmol],
      });
    }

    await saveActivityStreams(EMAIL, [
      {
        activityId: "act-with-bg",
        name: "Easy Run",
        category: "easy",
        fuelRate: 48,
        hr: [
          { time: 0, value: 120 },
          { time: runDurationMin, value: 145 },
        ],
        runStartMs,
        activityDate: "2026-04-15",
      },
    ]);

    const loaded = await getActivityStreams(EMAIL);
    expect(loaded).toHaveLength(1);
    const ctx = loaded[0].runBGContext;
    expect(ctx).not.toBeNull();
    expect(ctx?.pre?.startBG).toBeCloseTo(8.0, 0);
    expect(ctx?.post?.endBG).toBeCloseTo(8.0 - 0.05 * runDurationMin, 0);
    expect(ctx?.post?.peak60mAboveEnd).toBeDefined();
  });

  it("ignores client-sent runBGContext entirely (server never persists it)", async () => {
    const clientForgedContext = {
      activityId: "act-forged",
      category: "easy" as const,
      pre: { entrySlope30m: 999, entryStability: 999, startBG: 999, readingCount: 999 },
      post: null,
      totalBGImpact: null,
    };

    await saveActivityStreams(EMAIL, [
      {
        activityId: "act-forged",
        category: "easy",
        fuelRate: null,
        hr: [{ time: 0, value: 120 }],
        runStartMs: 1_700_000_000_000,
        runBGContext: clientForgedContext,
      },
    ]);

    // No bg_readings → recomputed context is null. The forged 999s never land.
    const loaded = await getActivityStreams(EMAIL);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].runBGContext).toBeNull();
  });
});
