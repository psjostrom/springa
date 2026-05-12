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

import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import {
  getActivityStreams,
  getActivityStreamsWithStatus,
  saveActivityStreams,
} from "../activityStreamsDb";
import type { CachedActivity } from "../activityStreamsDb";
import { SCHEMA_DDL } from "../db";
import { updateCredentials } from "../credentials";

const EMAIL = "test@test.com";
const NS_URL = "https://scout.test";
const NS_SECRET = "test-secret";

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

describe("getActivityStreams computes runBGContext on read via Scout batch", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM activity_streams");
    await holder.db.execute("DELETE FROM user_settings");
  });

  it("returns null runBGContext when no NS credentials are configured", async () => {
    await saveActivityStreams(EMAIL, [
      {
        activityId: "act-no-creds",
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

    // No user_settings row → no creds → no Scout call → context is null.
    const loaded = await getActivityStreams(EMAIL);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].runBGContext).toBeNull();
  });

  it("returns null runBGContext when Scout has no readings for the window", async () => {
    await updateCredentials(EMAIL, { nightscoutUrl: NS_URL, nightscoutSecret: NS_SECRET });
    server.use(
      http.post(`${NS_URL}/api/v1/entries/batch`, () => HttpResponse.json({ readings: [] })),
    );

    await saveActivityStreams(EMAIL, [
      {
        activityId: "act-empty",
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

  it("computes runBGContext from a single batched Scout call covering all activity windows", async () => {
    await updateCredentials(EMAIL, { nightscoutUrl: NS_URL, nightscoutSecret: NS_SECRET });

    // Two activities at different times. Each gets its own 3.5h window.
    const runAStart = 1_700_000_000_000;
    const runADurMin = 30;
    const runAEnd = runAStart + runADurMin * 60_000;

    const runBStart = runAStart + 7 * 24 * 60 * 60 * 1000; // one week later
    const runBDurMin = 60;
    const runBEnd = runBStart + runBDurMin * 60_000;

    // Build a flat readings response covering BOTH windows. 5-min cadence,
    // declining trend during each run.
    const buildReadings = (startMs: number, endMs: number, baseBG: number) => {
      const out: { ts: number; mmol: number }[] = [];
      for (let ts = startMs - 60 * 60_000; ts <= endMs + 2 * 60 * 60_000; ts += 5 * 60_000) {
        const elapsedMin = (ts - startMs) / 60_000;
        const mmol = Math.max(4.0, baseBG - 0.05 * elapsedMin);
        out.push({ ts, mmol });
      }
      return out;
    };
    const readings = [
      ...buildReadings(runAStart, runAEnd, 8.0),
      ...buildReadings(runBStart, runBEnd, 9.0),
    ].sort((a, b) => a.ts - b.ts);

    interface BatchBody { windows: { since: number; until: number }[] }
    let batchCallCount = 0;
    const captured: { body?: BatchBody } = {};
    server.use(
      http.post(`${NS_URL}/api/v1/entries/batch`, async ({ request }) => {
        batchCallCount++;
        captured.body = (await request.json()) as BatchBody;
        return HttpResponse.json({ readings });
      }),
    );

    await saveActivityStreams(EMAIL, [
      {
        activityId: "act-a",
        name: "Easy A",
        category: "easy",
        fuelRate: 48,
        hr: [
          { time: 0, value: 120 },
          { time: runADurMin, value: 145 },
        ],
        runStartMs: runAStart,
        activityDate: "2026-04-15",
      },
      {
        activityId: "act-b",
        name: "Easy B",
        category: "easy",
        fuelRate: 50,
        hr: [
          { time: 0, value: 120 },
          { time: runBDurMin, value: 145 },
        ],
        runStartMs: runBStart,
        activityDate: "2026-04-22",
      },
    ]);

    const loaded = await getActivityStreams(EMAIL);
    expect(loaded).toHaveLength(2);

    // Single Scout call for both activities (the whole point of the batch).
    expect(batchCallCount).toBe(1);
    expect(captured.body?.windows).toHaveLength(2);

    const a = loaded.find((x) => x.activityId === "act-a");
    const b = loaded.find((x) => x.activityId === "act-b");
    expect(a?.runBGContext).not.toBeNull();
    expect(a?.runBGContext?.pre?.startBG).toBeCloseTo(8.0, 0);
    expect(a?.runBGContext?.post?.endBG).toBeCloseTo(8.0 - 0.05 * runADurMin, 0);
    expect(b?.runBGContext).not.toBeNull();
    expect(b?.runBGContext?.pre?.startBG).toBeCloseTo(9.0, 0);
    expect(b?.runBGContext?.post?.endBG).toBeCloseTo(9.0 - 0.05 * runBDurMin, 0);
  });

  it("returns null contexts when the Scout call fails", async () => {
    await updateCredentials(EMAIL, { nightscoutUrl: NS_URL, nightscoutSecret: NS_SECRET });
    server.use(
      http.post(`${NS_URL}/api/v1/entries/batch`, () => new HttpResponse(null, { status: 500 })),
    );

    await saveActivityStreams(EMAIL, [
      {
        activityId: "act-fail",
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

  it("returns bgContextStatus 'no-credentials' when no NS configured", async () => {
    await saveActivityStreams(EMAIL, [
      {
        activityId: "act-x",
        category: "easy",
        fuelRate: null,
        hr: [{ time: 0, value: 120 }],
        runStartMs: 1_700_000_000_000,
      },
    ]);
    const result = await getActivityStreamsWithStatus(EMAIL);
    expect(result.bgContextStatus).toBe("no-credentials");
  });

  it("returns bgContextStatus 'upstream-error' when the Scout batch call fails", async () => {
    await updateCredentials(EMAIL, { nightscoutUrl: NS_URL, nightscoutSecret: NS_SECRET });
    server.use(
      http.post(`${NS_URL}/api/v1/entries/batch`, () => new HttpResponse(null, { status: 500 })),
    );
    await saveActivityStreams(EMAIL, [
      {
        activityId: "act-fail",
        category: "easy",
        fuelRate: null,
        hr: [{ time: 0, value: 120 }, { time: 30, value: 140 }],
        runStartMs: 1_700_000_000_000,
      },
    ]);
    const result = await getActivityStreamsWithStatus(EMAIL);
    expect(result.bgContextStatus).toBe("upstream-error");
    expect(result.activities[0].runBGContext).toBeNull();
  });

  it("returns bgContextStatus 'no-input' when there are no activities to compute", async () => {
    await updateCredentials(EMAIL, { nightscoutUrl: NS_URL, nightscoutSecret: NS_SECRET });
    const result = await getActivityStreamsWithStatus(EMAIL);
    expect(result.bgContextStatus).toBe("no-input");
    expect(result.activities).toHaveLength(0);
  });

  it("returns bgContextStatus 'ok' on a successful Scout batch call", async () => {
    await updateCredentials(EMAIL, { nightscoutUrl: NS_URL, nightscoutSecret: NS_SECRET });
    server.use(
      http.post(`${NS_URL}/api/v1/entries/batch`, () =>
        HttpResponse.json({ readings: [] }),
      ),
    );
    await saveActivityStreams(EMAIL, [
      {
        activityId: "act-ok",
        category: "easy",
        fuelRate: null,
        hr: [{ time: 0, value: 120 }, { time: 30, value: 140 }],
        runStartMs: 1_700_000_000_000,
      },
    ]);
    const result = await getActivityStreamsWithStatus(EMAIL);
    expect(result.bgContextStatus).toBe("ok");
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

    // No NS creds set → no Scout call → context is null. The forged 999s never land.
    const loaded = await getActivityStreams(EMAIL);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].runBGContext).toBeNull();
  });
});
