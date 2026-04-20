import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
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
