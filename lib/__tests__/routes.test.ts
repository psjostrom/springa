import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "dummy";
  process.env.VAPID_PRIVATE_KEY = "dummy";
  return { holder: { db: null as unknown as Client } };
});

vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

const mockFetchAthleteProfile = vi.fn().mockResolvedValue({});
const mockFetchActivityById = vi.fn().mockResolvedValue(null);
const mockFetchActivitiesByDateRange = vi.fn().mockResolvedValue([]);
const mockUpdateActivityFeedback = vi.fn().mockResolvedValue(undefined);
const mockUpdateActivityCarbs = vi.fn().mockResolvedValue(undefined);
const mockUpdateActivityPreRunCarbs = vi.fn().mockResolvedValue(undefined);
const mockAuthHeader = vi.fn().mockReturnValue("Basic test");
vi.mock("@/lib/intervalsApi", () => ({
  fetchAthleteProfile: (...args: unknown[]) => mockFetchAthleteProfile(...args),
  fetchActivityById: (...args: unknown[]) => mockFetchActivityById(...args),
  fetchActivitiesByDateRange: (...args: unknown[]) => mockFetchActivitiesByDateRange(...args),
  updateActivityFeedback: (...args: unknown[]) => mockUpdateActivityFeedback(...args),
  updateActivityCarbs: (...args: unknown[]) => mockUpdateActivityCarbs(...args),
  updateActivityPreRunCarbs: (...args: unknown[]) => mockUpdateActivityPreRunCarbs(...args),
  authHeader: (...args: unknown[]) => mockAuthHeader(...args),
}));

const mockFetchRunContext = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/intervalsHelpers", () => ({
  fetchRunContext: (...args: unknown[]) => mockFetchRunContext(...args),
}));

// Mock next/server's after() — runs the callback synchronously in tests
// since there's no Next.js request scope available.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => Promise<void>) => { fn().catch(() => {}); } };
});

const mockSendNotification = vi.fn().mockResolvedValue({});
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { API_BASE } from "../constants";

import { SCHEMA_DDL } from "../db";
import * as bgDb from "../bgDb";
const {
  getBGReadings,
  monthKey,
  sha1,
} = bgDb;
import { GET as entriesGET, POST as entriesPOST } from "@/app/api/v1/entries/route";
import { GET as bgGET } from "@/app/api/bg/route";
import {
  GET as settingsGET,
  PUT as settingsPUT,
} from "@/app/api/settings/route";
import {
  GET as bgCacheGET,
  PUT as bgCachePUT,
} from "@/app/api/bg-cache/route";
import { POST as runCompletedPOST } from "@/app/api/run-completed/route";
import {
  GET as feedbackGET,
  POST as feedbackPOST,
} from "@/app/api/run-feedback/route";
import { GET as treatmentsGET } from "@/app/api/v1/treatments/route";
import { saveTreatments } from "@/lib/treatmentsDb";
import type { Treatment } from "@/lib/treatmentsDb";
import {
  GET as prerunCarbsGET,
  POST as prerunCarbsPOST,
  DELETE as prerunCarbsDELETE,
} from "@/app/api/prerun-carbs/route";
import { POST as pushSubscribePOST } from "@/app/api/push/subscribe/route";

const EMAIL = "runner@example.com";
const SECRET = "my-api-secret";

function reading(sgv: number, dateStr: string) {
  return { sgv, date: new Date(dateStr).getTime(), direction: "Flat" };
}

function authedSession() {
  mockAuth.mockResolvedValue({ user: { email: EMAIL } });
}

function postEntries(apiSecret: string, body: unknown) {
  return entriesPOST(
    new Request("http://localhost/api/v1/entries", {
      method: "POST",
      headers: { "api-secret": apiSecret, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function getEntries(apiSecret: string, params = "") {
  return entriesGET(
    new Request(`http://localhost/api/v1/entries${params ? `?${params}` : ""}`, {
      headers: { "api-secret": apiSecret },
    }),
  );
}

function putSettings(body: unknown) {
  return settingsPUT(
    new Request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function putBGCache(body: unknown) {
  return bgCachePUT(
    new Request("http://localhost/api/bg-cache", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const testDb = () => holder.db;

async function countReadings(email: string, month?: string): Promise<number> {
  if (month) {
    const [y, mo] = month.split("-").map(Number);
    const start = Date.UTC(y, mo - 1, 1);
    const end = Date.UTC(y, mo, 1);
    const result = await testDb().execute({
      sql: "SELECT COUNT(*) as cnt FROM bg_readings WHERE email = ? AND ts >= ? AND ts < ?",
      args: [email, start, end],
    });
    return result.rows[0].cnt as number;
  }
  const result = await testDb().execute({
    sql: "SELECT COUNT(*) as cnt FROM bg_readings WHERE email = ?",
    args: [email],
  });
  return result.rows[0].cnt as number;
}

/** Seed a user_settings row for the test user. */
async function seedUser() {
  await testDb().execute({
    sql: "INSERT OR IGNORE INTO user_settings (email) VALUES (?)",
    args: [EMAIL],
  });
}

// Store original env to restore after each test
let origApiSecret: string | undefined;
let origIntervalsApiKey: string | undefined;

beforeAll(async () => {
  await testDb().executeMultiple(SCHEMA_DDL);
});

beforeEach(async () => {
  await testDb().execute("DELETE FROM user_settings");
  await testDb().execute("DELETE FROM bg_readings");
  await testDb().execute("DELETE FROM activity_streams");
  await testDb().execute("DELETE FROM run_analysis");
  await testDb().execute("DELETE FROM push_subscriptions");
  await testDb().execute("DELETE FROM prerun_carbs");
  mockAuth.mockReset();
  mockFetchAthleteProfile.mockReset().mockResolvedValue({});
  mockFetchActivityById.mockReset().mockResolvedValue(null);
  mockUpdateActivityFeedback.mockReset().mockResolvedValue(undefined);
  mockUpdateActivityCarbs.mockReset().mockResolvedValue(undefined);
  mockUpdateActivityPreRunCarbs.mockReset().mockResolvedValue(undefined);
  mockSendNotification.mockReset().mockResolvedValue({});

  // Save and set env vars for tests
  origApiSecret = process.env.CGM_SECRET;
  origIntervalsApiKey = process.env.INTERVALS_API_KEY;
  process.env.CGM_SECRET = SECRET;
  process.env.INTERVALS_API_KEY = "test-key";
});

afterEach(() => {
  // Restore env vars
  if (origApiSecret !== undefined) process.env.CGM_SECRET = origApiSecret;
  else process.env.CGM_SECRET = "";
  if (origIntervalsApiKey !== undefined) process.env.INTERVALS_API_KEY = origIntervalsApiKey;
  else process.env.INTERVALS_API_KEY = "";
});

// ---------------------------------------------------------------------------
// Full pipeline: entries POST → xDrip GET
// ---------------------------------------------------------------------------
describe("end-to-end: entries → BG GET", () => {
  it("posts readings with valid secret, reads them back", async () => {
    authedSession();
    await seedUser();

    // CGM source sends SHA1(secret) as api-secret
    const hash = sha1(SECRET);

    // POST readings via entries route
    const res = await postEntries(hash, [
      reading(145, "2026-02-20T10:00:00Z"),
      reading(155, "2026-02-20T10:05:00Z"),
      reading(160, "2026-02-20T10:10:00Z"),
    ]);
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(3);

    // Verify readings stored in DB
    expect(await countReadings(EMAIL, "2026-02")).toBe(3);

    // GET readings back via CGM route
    const getRes = await bgGET();
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    expect(data.readings).toHaveLength(3);
    expect(data.current.sgv).toBe(160);
    expect(data.trend).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cross-month sharding
// ---------------------------------------------------------------------------
describe("entries route: cross-month storage", () => {
  it("stores readings from different months correctly", async () => {
    await seedUser();
    const hash = sha1(SECRET);

    const res = await postEntries(hash, [
      reading(140, "2026-01-31T23:50:00Z"),
      reading(145, "2026-01-31T23:55:00Z"),
      reading(150, "2026-02-01T00:00:00Z"),
      reading(155, "2026-02-01T00:05:00Z"),
    ]);
    expect(res.status).toBe(200);

    expect(await countReadings(EMAIL, "2026-01")).toBe(2);
    expect(await countReadings(EMAIL, "2026-02")).toBe(2);
  });

  it("handles year rollover (Dec → Jan)", async () => {
    await seedUser();
    const hash = sha1(SECRET);

    await postEntries(hash, [
      reading(140, "2025-12-31T23:55:00Z"),
      reading(150, "2026-01-01T00:05:00Z"),
    ]);

    expect(await countReadings(EMAIL, "2025-12")).toBe(1);
    expect(await countReadings(EMAIL, "2026-01")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Dedup and merge
// ---------------------------------------------------------------------------
describe("entries route: dedup and merge", () => {
  it("deduplicates readings with identical timestamps", async () => {
    await seedUser();
    const hash = sha1(SECRET);

    await postEntries(hash, [
      reading(145, "2026-02-20T10:00:00Z"),
      reading(155, "2026-02-20T10:05:00Z"),
    ]);
    await postEntries(hash, [
      reading(145, "2026-02-20T10:00:00Z"),
      reading(155, "2026-02-20T10:05:00Z"),
    ]);

    expect(await countReadings(EMAIL, "2026-02")).toBe(2);
  });

  it("merges new readings with existing and sorts chronologically", async () => {
    await seedUser();
    const hash = sha1(SECRET);

    await postEntries(hash, [
      reading(145, "2026-02-20T10:00:00Z"),
      reading(160, "2026-02-20T10:10:00Z"),
    ]);
    await postEntries(hash, [
      reading(155, "2026-02-20T10:05:00Z"), // between existing
    ]);

    const readings = await getBGReadings(EMAIL, ["2026-02"]);
    expect(readings).toHaveLength(3);
    expect(readings[0].ts).toBeLessThan(readings[1].ts);
    expect(readings[1].ts).toBeLessThan(readings[2].ts);
  });

  it("only writes new/changed readings, not the full shard", async () => {
    await seedUser();
    const hash = sha1(SECRET);

    // Seed 100 readings (5-min intervals)
    const seed = Array.from({ length: 100 }, (_, i) =>
      reading(140 + (i % 20), `2026-02-20T${String(Math.floor(i / 12)).padStart(2, "0")}:${String((i % 12) * 5).padStart(2, "0")}:00Z`),
    );
    await postEntries(hash, seed);
    expect(await countReadings(EMAIL, "2026-02")).toBe(100);

    // Spy on saveBGReadings for the next call
    const spy = vi.spyOn(bgDb, "saveBGReadings");

    // Post 1 new reading
    await postEntries(hash, [
      reading(165, "2026-02-20T09:00:00Z"),
    ]);

    // Should write only the new reading + at most a few direction-changed neighbors
    expect(spy).toHaveBeenCalledOnce();
    const writtenRows = spy.mock.calls[0][1];
    expect(writtenRows.length).toBeLessThanOrEqual(5);
    expect(writtenRows.length).toBeGreaterThanOrEqual(1);

    // Data integrity: all 101 readings present
    expect(await countReadings(EMAIL, "2026-02")).toBe(101);

    spy.mockRestore();
  });

  it("writes nothing when all readings are duplicates", async () => {
    await seedUser();
    const hash = sha1(SECRET);

    await postEntries(hash, [
      reading(145, "2026-02-20T10:00:00Z"),
      reading(155, "2026-02-20T10:05:00Z"),
    ]);

    const spy = vi.spyOn(bgDb, "saveBGReadings");

    // Re-post identical readings
    await postEntries(hash, [
      reading(145, "2026-02-20T10:00:00Z"),
      reading(155, "2026-02-20T10:05:00Z"),
    ]);

    // Nothing changed — should not write at all
    expect(spy).not.toHaveBeenCalled();
    expect(await countReadings(EMAIL, "2026-02")).toBe(2);

    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Auth rejection (all routes)
// ---------------------------------------------------------------------------
describe("auth rejection", () => {
  it("entries POST: missing api-secret → 401", async () => {
    const req = new Request("http://localhost/api/v1/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([reading(145, "2026-02-20T10:00:00Z")]),
    });
    expect((await entriesPOST(req)).status).toBe(401);
  });

  it("entries POST: wrong api-secret → 401", async () => {
    const res = await postEntries("wrong-hash", [
      reading(145, "2026-02-20T10:00:00Z"),
    ]);
    expect(res.status).toBe(401);
  });

  it("BG GET: no session → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await bgGET()).status).toBe(401);
  });

  it("BG GET: session without email → 401", async () => {
    mockAuth.mockResolvedValue({ user: {} });
    expect((await bgGET()).status).toBe(401);
  });

  it("settings GET: no session → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await settingsGET()).status).toBe(401);
  });

  it("settings PUT: no session → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await putSettings({ raceDate: "2026-06-13" })).status).toBe(401);
  });

  it("bg-cache GET: no session → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await bgCacheGET()).status).toBe(401);
  });

  it("bg-cache PUT: no session → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await putBGCache([])).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Default month range for getBGReadings
// ---------------------------------------------------------------------------
describe("getBGReadings default range", () => {
  it("reads current + previous month, ignores older data", async () => {
    const now = new Date();
    const prev = new Date(now);
    prev.setMonth(prev.getMonth() - 1);
    const old = new Date(now);
    old.setMonth(old.getMonth() - 3);

    // Insert readings across three different months
    for (const [ts, sgv, mmol] of [
      [now.getTime(), 145, 8.0],
      [prev.getTime(), 140, 7.8],
      [old.getTime(), 200, 11.1],
    ] as [number, number, number][]) {
      await testDb().execute({
        sql: "INSERT INTO bg_readings (email, ts, mmol, sgv, direction) VALUES (?, ?, ?, ?, ?)",
        args: [EMAIL, ts, mmol, sgv, "Flat"],
      });
    }

    const readings = await getBGReadings(EMAIL);
    expect(readings).toHaveLength(2);
    expect(readings.every((r) => r.sgv !== 200)).toBe(true);
  });

  it("reads specific months when provided", async () => {
    await testDb().execute({
      sql: "INSERT INTO bg_readings (email, ts, mmol, sgv, direction) VALUES (?, ?, ?, ?, ?)",
      args: [EMAIL, new Date("2025-06-15").getTime(), 8.0, 145, "Flat"],
    });
    await testDb().execute({
      sql: "INSERT INTO bg_readings (email, ts, mmol, sgv, direction) VALUES (?, ?, ?, ?, ?)",
      args: [EMAIL, new Date("2025-07-15").getTime(), 8.3, 150, "Flat"],
    });

    const readings = await getBGReadings(EMAIL, ["2025-06"]);
    expect(readings).toHaveLength(1);
    expect(readings[0].sgv).toBe(145);
  });
});

// ---------------------------------------------------------------------------
// Settings route
// ---------------------------------------------------------------------------
describe("settings route", () => {
  it("PUT saves and GET retrieves race config", async () => {
    authedSession();

    await putSettings({ raceDate: "2026-06-13", raceName: "EcoTrail" });

    const res = await settingsGET();
    const data = await res.json();
    expect(data.raceDate).toBe("2026-06-13");
    expect(data.raceName).toBe("EcoTrail");
  });

  it("GET returns API key from env var", async () => {
    authedSession();
    await seedUser();

    const res = await settingsGET();
    const data = await res.json();
    expect(data.intervalsApiKey).toBe("test-key");
  });

  it("GET returns connected booleans from env vars", async () => {
    authedSession();
    await seedUser();

    const res = await settingsGET();
    const data = await res.json();
    expect(data.cgmConnected).toBe(true);
    expect(data.mylifeConnected).toBe(false);
  });

  it("PUT ignores credential fields", async () => {
    authedSession();

    // Attempt to set credential fields — should be silently ignored
    await putSettings({ raceDate: "2026-06-13", intervalsApiKey: "hacked" });

    const res = await settingsGET();
    const data = await res.json();
    // API key comes from env, not the PUT body
    expect(data.intervalsApiKey).toBe("test-key");
    expect(data.raceDate).toBe("2026-06-13");
  });
});

// ---------------------------------------------------------------------------
// BG cache route
// ---------------------------------------------------------------------------
describe("bg-cache route", () => {
  it("PUT saves and GET retrieves cached activities", async () => {
    authedSession();
    const cached = [
      {
        activityId: "act-1",
        category: "easy" as const,
        fuelRate: 8,
        startBG: 10.2,
        hr: [{ time: 0, value: 120 }],
      },
    ];

    const putRes = await putBGCache(cached);
    expect(putRes.status).toBe(200);

    const getRes = await bgCacheGET();
    const data = await getRes.json();
    expect(data).toHaveLength(1);
    expect(data[0].activityId).toBe("act-1");
    expect(data[0].fuelRate).toBe(8);
  });

  it("GET returns empty array when no cache exists", async () => {
    authedSession();
    const res = await bgCacheGET();
    const data = await res.json();
    expect(data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("edge cases", () => {
  it("entries POST with empty array returns count 0, no readings written", async () => {
    await seedUser();
    const hash = sha1(SECRET);

    const res = await postEntries(hash, []);
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(0);

    expect(await countReadings(EMAIL)).toBe(0);
  });

  it("BG GET with no readings returns empty + null trend", async () => {
    authedSession();
    const res = await bgGET();
    const data = await res.json();
    expect(data.readings).toHaveLength(0);
    expect(data.trend).toBeNull();
  });

  it("monthKey uses UTC", async () => {
    expect(monthKey(new Date("2026-02-01T00:00:00Z").getTime())).toBe("2026-02");
    expect(monthKey(new Date("2026-01-31T23:59:59Z").getTime())).toBe("2026-01");
    expect(monthKey(new Date("2025-12-31T23:59:59Z").getTime())).toBe("2025-12");
  });
});

// ---------------------------------------------------------------------------
// Push subscribe route
// ---------------------------------------------------------------------------

function postPushSubscribe(body: unknown) {
  return pushSubscribePOST(
    new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("push/subscribe route", () => {
  it("saves subscription for authenticated user", async () => {
    authedSession();
    const res = await postPushSubscribe({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: "test-p256dh", auth: "test-auth" },
    });
    expect(res.status).toBe(200);

    const rows = await testDb().execute({
      sql: "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE email = ?",
      args: [EMAIL],
    });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].endpoint).toBe("https://fcm.googleapis.com/fcm/send/abc123");
  });

  it("rejects unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await postPushSubscribe({
      endpoint: "https://example.com",
      keys: { p256dh: "x", auth: "y" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid subscription body", async () => {
    authedSession();
    const res = await postPushSubscribe({ endpoint: "https://example.com" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Run completed route
// ---------------------------------------------------------------------------

function postRunCompleted(apiSecret: string, body: unknown) {
  return runCompletedPOST(
    new Request("http://localhost/api/run-completed", {
      method: "POST",
      headers: {
        "api-secret": apiSecret,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("run-completed route", () => {
  it("sends push notification on valid secret", async () => {
    await seedUser();

    // Add a push subscription so sendPushToUser has something to send to
    await testDb().execute({
      sql: "INSERT INTO push_subscriptions (email, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [EMAIL, "https://fcm.example.com/push/abc", "p256dh-val", "auth-val", Date.now()],
    });

    // SugarRun sends raw secret
    const res = await postRunCompleted(SECRET, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify web-push was called
    expect(mockSendNotification).toHaveBeenCalledOnce();
    const pushSub = mockSendNotification.mock.calls[0][0];
    expect(pushSub.endpoint).toBe("https://fcm.example.com/push/abc");
  });

  it("rejects missing api-secret", async () => {
    const res = await runCompletedPOST(
      new Request("http://localhost/api/run-completed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects wrong api-secret", async () => {
    const res = await postRunCompleted("wrong-secret", {});
    expect(res.status).toBe(401);
  });

  it("works with no push subscriptions (no notification sent)", async () => {
    await seedUser();
    const res = await postRunCompleted(SECRET, {});
    expect(res.status).toBe(200);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("cleans up stale subscription on 410", async () => {
    await seedUser();
    await testDb().execute({
      sql: "INSERT INTO push_subscriptions (email, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [EMAIL, "https://stale.example.com/push", "p", "a", Date.now()],
    });

    mockSendNotification.mockRejectedValue({ statusCode: 410 });

    const res = await postRunCompleted(SECRET, {});
    expect(res.status).toBe(200);

    // Stale subscription should be deleted
    const rows = await testDb().execute({
      sql: "SELECT * FROM push_subscriptions WHERE email = ?",
      args: [EMAIL],
    });
    expect(rows.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Run feedback route
// ---------------------------------------------------------------------------

function getFeedbackByActivity(activityId: string) {
  return feedbackGET(
    new Request(`http://localhost/api/run-feedback?activityId=${activityId}`),
  );
}

function postFeedback(body: unknown) {
  return feedbackPOST(
    new Request("http://localhost/api/run-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("run-feedback route", () => {
  it("GET returns activity data from Intervals.icu", async () => {
    authedSession();
    mockFetchActivityById.mockResolvedValue({
      id: "i123",
      start_date: "2026-02-20T10:00:00Z",
      name: "Easy Run",
      Rating: "good",
      FeedbackComment: "Felt great",
      carbs_ingested: 45,
      distance: 5000,
      moving_time: 2400,
      average_hr: 128,
    });

    const res = await getFeedbackByActivity("i123");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rating).toBe("good");
    expect(data.comment).toBe("Felt great");
    expect(data.carbsG).toBe(45);
    expect(data.distance).toBe(5000);
  });

  it("GET without activityId finds latest unrated run", async () => {
    authedSession();
    mockFetchActivitiesByDateRange.mockResolvedValue([
      { id: "i100", start_date: "2026-03-01T08:00:00Z", type: "Run", Rating: "good", name: "Old" },
      { id: "i200", start_date: "2026-03-01T14:00:00Z", type: "Run", Rating: "", name: "Latest", distance: 6000, moving_time: 3000, average_hr: 130 },
    ]);

    const res = await feedbackGET(new Request("http://localhost/api/run-feedback"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.activityId).toBe("i200");
  });

  it("GET without activityId returns 404 with retry when no unrated run", async () => {
    authedSession();
    mockFetchActivitiesByDateRange.mockResolvedValue([]);

    const res = await feedbackGET(new Request("http://localhost/api/run-feedback"));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.retry).toBe(true);
  });

  it("GET returns 404 when activity not found", async () => {
    authedSession();
    mockFetchActivityById.mockResolvedValue(null);

    const res = await getFeedbackByActivity("i999");
    expect(res.status).toBe(404);
  });

  it("POST writes feedback to Intervals.icu", async () => {
    authedSession();

    const res = await postFeedback({ activityId: "i123", rating: "good", comment: "Felt great" });
    expect(res.status).toBe(200);
    expect(mockUpdateActivityFeedback).toHaveBeenCalledWith("test-key", "i123", "good", "Felt great");
  });

  it("POST rejects missing activityId or rating", async () => {
    authedSession();
    const res = await postFeedback({ activityId: "i123" });
    expect(res.status).toBe(400);
  });

  it("GET/POST reject unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await getFeedbackByActivity("i123")).status).toBe(401);
    expect((await postFeedback({ activityId: "i123", rating: "good" })).status).toBe(401);
  });

  it("GET returns pre-run carbs from Turso when activity has paired_event_id", async () => {
    authedSession();

    // Seed pre-run carbs for event 456
    await testDb().execute({
      sql: "INSERT INTO prerun_carbs (email, event_id, carbs_g, created_at) VALUES (?, ?, ?, ?)",
      args: [EMAIL, "456", 30, Date.now()],
    });

    mockFetchActivityById.mockResolvedValue({
      id: "i123",
      start_date: "2026-02-20T10:00:00Z",
      name: "Easy Run",
      paired_event_id: 456,
      // No PreRunCarbsG set on activity
    });

    const res = await getFeedbackByActivity("i123");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.preRunCarbsG).toBe(30);
  });

  it("GET finds pre-run carbs via matched event when paired_event_id is null", async () => {
    authedSession();

    // Seed pre-run carbs for event 789
    await testDb().execute({
      sql: "INSERT INTO prerun_carbs (email, event_id, carbs_g, created_at) VALUES (?, ?, ?, ?)",
      args: [EMAIL, "789", 25, Date.now()],
    });

    // Activity has NO paired_event_id (not yet auto-paired)
    mockFetchActivityById.mockResolvedValue({
      id: "i456",
      start_date: "2026-02-20T10:00:00Z",
      start_date_local: "2026-02-20T11:00:00",
      name: "Easy Run",
      moving_time: 2400,
    });

    // MSW: return a WORKOUT event on that date with id 789
    server.use(
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          { id: 789, category: "WORKOUT", start_date_local: "2026-02-20T12:00:00", carbs_per_hour: 48, description: "- 41m 68-83% LTHR (115-140 bpm)" },
        ]);
      }),
    );

    const res = await getFeedbackByActivity("i456");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.preRunCarbsG).toBe(25);
  });

  it("GET computes prescribedCarbsG from planned duration, not actual", async () => {
    authedSession();

    // Activity ran for 44 min (2640s), but the plan says 41m
    mockFetchActivityById.mockResolvedValue({
      id: "i789",
      start_date: "2026-02-20T10:00:00Z",
      start_date_local: "2026-02-20T11:00:00",
      name: "Easy Run",
      moving_time: 2640,
    });

    // MSW: WORKOUT event with 48g/h and a 41m description
    server.use(
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          { id: 999, category: "WORKOUT", start_date_local: "2026-02-20T12:00:00", carbs_per_hour: 48, description: "- 41m 68-83% LTHR (115-140 bpm)" },
        ]);
      }),
    );

    const res = await getFeedbackByActivity("i789");
    expect(res.status).toBe(200);
    const data = await res.json();
    // 48 g/h × (41/60) = 32.8 → 33g (from planned duration)
    // NOT 48 × (44/60) = 35.2 → 35g (from actual duration)
    expect(data.prescribedCarbsG).toBe(33);
  });

  it("GET prefers activity PreRunCarbsG over Turso fallback", async () => {
    authedSession();

    // Seed pre-run carbs for event 456
    await testDb().execute({
      sql: "INSERT INTO prerun_carbs (email, event_id, carbs_g, created_at) VALUES (?, ?, ?, ?)",
      args: [EMAIL, "456", 30, Date.now()],
    });

    mockFetchActivityById.mockResolvedValue({
      id: "i123",
      start_date: "2026-02-20T10:00:00Z",
      name: "Easy Run",
      paired_event_id: 456,
      PreRunCarbsG: 50, // Activity already has pre-run carbs
    });

    const res = await getFeedbackByActivity("i123");
    expect(res.status).toBe(200);
    const data = await res.json();
    // Should use activity values, not Turso fallback
    expect(data.preRunCarbsG).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Pre-run carbs route
// ---------------------------------------------------------------------------

function getPrerunCarbs(eventId: string) {
  return prerunCarbsGET(
    new Request(`http://localhost/api/prerun-carbs?eventId=${eventId}`),
  );
}

function postPrerunCarbs(body: unknown) {
  return prerunCarbsPOST(
    new Request("http://localhost/api/prerun-carbs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function deletePrerunCarbs(eventId: string) {
  return prerunCarbsDELETE(
    new Request(`http://localhost/api/prerun-carbs?eventId=${eventId}`, {
      method: "DELETE",
    }),
  );
}

describe("prerun-carbs route", () => {
  it("POST saves pre-run carbs and GET retrieves them", async () => {
    authedSession();

    const postRes = await postPrerunCarbs({ eventId: "evt-123", carbsG: 35 });
    expect(postRes.status).toBe(200);

    const getRes = await getPrerunCarbs("evt-123");
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    expect(data.carbsG).toBe(35);
  });

  it("POST upserts existing pre-run carbs", async () => {
    authedSession();

    await postPrerunCarbs({ eventId: "evt-123", carbsG: 30 });
    await postPrerunCarbs({ eventId: "evt-123", carbsG: 40 });

    const res = await getPrerunCarbs("evt-123");
    const data = await res.json();
    expect(data.carbsG).toBe(40);
  });

  it("GET returns null when no pre-run carbs exist", async () => {
    authedSession();

    const res = await getPrerunCarbs("evt-nonexistent");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.carbsG).toBeNull();
  });

  it("GET rejects missing eventId", async () => {
    authedSession();
    const res = await prerunCarbsGET(new Request("http://localhost/api/prerun-carbs"));
    expect(res.status).toBe(400);
  });

  it("POST rejects missing eventId", async () => {
    authedSession();
    const res = await postPrerunCarbs({ carbsG: 30 });
    expect(res.status).toBe(400);
  });

  it("DELETE removes pre-run carbs row", async () => {
    authedSession();

    await postPrerunCarbs({ eventId: "evt-del", carbsG: 25 });

    const delRes = await deletePrerunCarbs("evt-del");
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ ok: true });

    const getRes = await getPrerunCarbs("evt-del");
    const data = await getRes.json();
    expect(data.carbsG).toBeNull();
  });

  it("DELETE rejects missing eventId", async () => {
    authedSession();
    const res = await prerunCarbsDELETE(new Request("http://localhost/api/prerun-carbs"));
    expect(res.status).toBe(400);
  });

  it("GET/POST/DELETE reject unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await getPrerunCarbs("evt-123")).status).toBe(401);
    expect((await postPrerunCarbs({ eventId: "evt-123", carbsG: 30 })).status).toBe(401);
    expect((await deletePrerunCarbs("evt-123")).status).toBe(401);
  });
});

// --- GET /api/v1/entries ---

describe("GET /api/v1/entries", () => {
  it("rejects missing api-secret", async () => {
    const res = await getEntries("");
    expect(res.status).toBe(401);
  });

  it("rejects wrong api-secret", async () => {
    const res = await getEntries("wrong-secret");
    expect(res.status).toBe(401);
  });

  it("accepts plaintext api-secret", async () => {
    await seedUser();
    const res = await getEntries(SECRET);
    expect(res.status).toBe(200);
  });

  it("accepts SHA-1 hashed api-secret", async () => {
    await seedUser();
    const res = await getEntries(sha1(SECRET));
    expect(res.status).toBe(200);
  });

  it("returns 401 when no user configured", async () => {
    const res = await getEntries(SECRET);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No user configured");
  });

  it("returns empty array when no readings exist", async () => {
    await seedUser();
    const res = await getEntries(SECRET);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns entries in Nightscout format", async () => {
    await seedUser();
    const hash = sha1(SECRET);
    const ts = new Date("2026-02-20T10:00:00Z").getTime();

    await postEntries(hash, [reading(145, "2026-02-20T10:00:00Z")]);

    const res = await getEntries(SECRET, `find[date][$gt]=0&count=100`);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      sgv: 145,
      date: ts,
      direction: expect.any(String),
      type: "sgv",
      device: "Springa",
    });
    expect(body[0].dateString).toBe(new Date(ts).toISOString());
  });

  it("filters by find[date][$gt]", async () => {
    await seedUser();
    const hash = sha1(SECRET);

    await postEntries(hash, [
      reading(140, "2026-02-20T10:00:00Z"),
      reading(150, "2026-02-20T10:05:00Z"),
      reading(160, "2026-02-20T10:10:00Z"),
    ]);

    const cutoff = new Date("2026-02-20T10:04:00Z").getTime();
    const res = await getEntries(SECRET, `find[date][$gt]=${cutoff}&count=100`);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].sgv).toBe(150);
    expect(body[1].sgv).toBe(160);
  });

  it("respects count param", async () => {
    await seedUser();
    const hash = sha1(SECRET);

    await postEntries(hash, [
      reading(140, "2026-02-20T10:00:00Z"),
      reading(150, "2026-02-20T10:05:00Z"),
      reading(160, "2026-02-20T10:10:00Z"),
    ]);

    const res = await getEntries(SECRET, `find[date][$gt]=0&count=2`);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("defaults to last 30 days when no since param", async () => {
    await seedUser();
    const hash = sha1(SECRET);

    // Recent reading (within 30 days)
    const recent = new Date();
    recent.setDate(recent.getDate() - 1);
    await postEntries(hash, [reading(150, recent.toISOString())]);

    const res = await getEntries(SECRET);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

// --- GET /api/v1/treatments ---

function getTreatmentsReq(apiSecret: string, params = "") {
  return treatmentsGET(
    new Request(`http://localhost/api/v1/treatments${params ? `?${params}` : ""}`, {
      headers: { "api-secret": apiSecret },
    }),
  );
}

function makeTreatment(overrides: Partial<Treatment> & { id: string; ts: number }): Treatment {
  return {
    created_at: new Date(overrides.ts).toISOString(),
    event_type: "Correction Bolus",
    insulin: null,
    carbs: null,
    basal_rate: null,
    duration: null,
    entered_by: "test",
    ...overrides,
  };
}

describe("GET /api/v1/treatments", () => {
  beforeEach(async () => {
    origApiSecret = process.env.CGM_SECRET;
    process.env.CGM_SECRET = SECRET;
    await seedUser();
    // Clear treatments table
    await testDb().execute({ sql: "DELETE FROM treatments", args: [] });
  });

  afterEach(() => {
    process.env.CGM_SECRET = origApiSecret;
  });

  it("rejects missing api-secret", async () => {
    const res = await getTreatmentsReq("");
    expect(res.status).toBe(401);
  });

  it("rejects wrong api-secret", async () => {
    const res = await getTreatmentsReq("wrong-secret");
    expect(res.status).toBe(401);
  });

  it("accepts plaintext api-secret", async () => {
    const res = await getTreatmentsReq(SECRET);
    expect(res.status).toBe(200);
  });

  it("accepts SHA-1 hashed api-secret", async () => {
    const res = await getTreatmentsReq(sha1(SECRET));
    expect(res.status).toBe(200);
  });

  it("returns empty array when no treatments exist", async () => {
    const res = await getTreatmentsReq(SECRET);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns treatments in NS format", async () => {
    const now = Date.now();
    await saveTreatments(EMAIL, [
      makeTreatment({ id: "t1", ts: now, insulin: 5.0, event_type: "Meal Bolus" }),
    ]);

    const res = await getTreatmentsReq(SECRET);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]._id).toBe("t1");
    expect(body[0].eventType).toBe("Meal Bolus");
    expect(body[0].insulin).toBe(5.0);
    expect(body[0].enteredBy).toBe("test");
  });

  it("respects count param", async () => {
    const now = Date.now();
    await saveTreatments(EMAIL, [
      makeTreatment({ id: "t1", ts: now - 3000, insulin: 1.0 }),
      makeTreatment({ id: "t2", ts: now - 2000, insulin: 2.0 }),
      makeTreatment({ id: "t3", ts: now - 1000, insulin: 3.0 }),
    ]);

    const res = await getTreatmentsReq(SECRET, "count=2");
    const body = await res.json();
    expect(body).toHaveLength(2);
    // Newest first
    expect(body[0]._id).toBe("t3");
    expect(body[1]._id).toBe("t2");
  });

  it("filters by find[created_at][$gte]", async () => {
    const base = new Date("2026-03-19T10:00:00Z").getTime();
    await saveTreatments(EMAIL, [
      makeTreatment({ id: "old", ts: base - 60000, insulin: 1.0 }),
      makeTreatment({ id: "new", ts: base + 60000, insulin: 2.0 }),
    ]);

    const res = await getTreatmentsReq(SECRET, `count=100&find[created_at][$gte]=${base}`);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]._id).toBe("new");
  });

  it("filters by find[eventType]", async () => {
    const now = Date.now();
    await saveTreatments(EMAIL, [
      makeTreatment({ id: "bolus", ts: now - 2000, event_type: "Correction Bolus", insulin: 3.0 }),
      makeTreatment({ id: "carbs", ts: now - 1000, event_type: "Carb Correction", carbs: 15.0 }),
    ]);

    const res = await getTreatmentsReq(SECRET, "count=100&find[eventType]=Carb+Correction");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]._id).toBe("carbs");
  });

  it("ignores invalid timestamp in find param", async () => {
    const now = Date.now();
    await saveTreatments(EMAIL, [
      makeTreatment({ id: "t1", ts: now, insulin: 5.0 }),
    ]);

    // Invalid $gte should be ignored (no filter), not return epoch 0 results
    const res = await getTreatmentsReq(SECRET, "count=100&find[created_at][$gte]=garbage");
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("omits null fields from NS response", async () => {
    const now = Date.now();
    await saveTreatments(EMAIL, [
      makeTreatment({ id: "t1", ts: now, event_type: "Carb Correction", carbs: 30.0 }),
    ]);

    const res = await getTreatmentsReq(SECRET);
    const body = await res.json();
    expect(body[0]).not.toHaveProperty("insulin");
    expect(body[0]).not.toHaveProperty("absolute");
    expect(body[0]).not.toHaveProperty("duration");
    expect(body[0].carbs).toBe(30.0);
  });
});
