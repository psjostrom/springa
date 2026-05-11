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

describe("saveActivityStreams preserves run_bg_context", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM activity_streams");
    await holder.db.execute("DELETE FROM user_settings");
  });

  it("does not overwrite existing run_bg_context when incoming hr/glucose lengths match", async () => {
    // Arrange: seed a row with a populated run_bg_context.
    const seededContext = {
      activityId: "act-3",
      category: "easy",
      pre: { entrySlope30m: -0.05, entryStability: 0.4, startBG: 7.5, readingCount: 6 },
      post: {
        recoveryDrop30m: -0.3,
        nadirPostRun: 6.8,
        timeToStable: 12,
        postRunHypo: false,
        endBG: 7.0,
        readingCount: 25,
        peak30m: 7.2,
        spike30m: 0.2,
        peak60mAboveEnd: 0.5,
      },
      totalBGImpact: -0.5,
    };
    const hr = [
      { time: 0, value: 120 },
      { time: 30, value: 145 },
    ];
    const glucose = [
      { time: 0, value: 7.5 },
      { time: 30, value: 7.0 },
    ];

    await holder.db.execute({
      sql: `INSERT INTO activity_streams (email, activity_id, name, run_start_ms, fuel_rate, hr, run_bg_context, glucose)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        EMAIL,
        "act-3",
        "Easy Run",
        1_700_000_000_000,
        48,
        JSON.stringify(hr),
        JSON.stringify(seededContext),
        JSON.stringify(glucose),
      ],
    });

    // Act: save the same activity (client never sends runBGContext).
    const incoming: CachedActivity = {
      activityId: "act-3",
      name: "Easy Run",
      category: "easy",
      fuelRate: 48,
      hr,
      glucose,
      runStartMs: 1_700_000_000_000,
      activityDate: "2026-04-15",
    };
    await saveActivityStreams(EMAIL, [incoming]);

    // Assert: stored runBGContext is preserved verbatim.
    const loaded = await getActivityStreams(EMAIL);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].runBGContext).toEqual(seededContext);
  });

  it("ignores client-sent runBGContext entirely (server is the only owner)", async () => {
    // No prior row, no NS credentials, no local bg_readings — server-side
    // computation will return null, so the saved context must be null even
    // though the client tried to write a value.
    const clientForgedContext = {
      activityId: "act-4",
      category: "easy" as const,
      pre: { entrySlope30m: 999, entryStability: 999, startBG: 999, readingCount: 999 },
      post: null,
      totalBGImpact: null,
    };

    await saveActivityStreams(EMAIL, [
      {
        activityId: "act-4",
        category: "easy",
        fuelRate: null,
        hr: [{ time: 0, value: 120 }],
        runStartMs: 1_700_000_000_000,
        runBGContext: clientForgedContext,
      },
    ]);

    const loaded = await getActivityStreams(EMAIL);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].runBGContext).toBeNull();
  });
});
