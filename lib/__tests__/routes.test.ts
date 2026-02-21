import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { holder } = vi.hoisted(() => ({ holder: { db: null as any } }));

vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

import {
  saveXdripAuth,
  lookupXdripUser,
  getXdripReadings,
  monthKey,
  sha1,
  SCHEMA_DDL,
} from "../settings";
import { POST as entriesPOST } from "@/app/api/v1/entries/route";
import { GET as xdripGET } from "@/app/api/xdrip/route";
import {
  GET as settingsGET,
  PUT as settingsPUT,
} from "@/app/api/settings/route";
import {
  GET as bgCacheGET,
  PUT as bgCachePUT,
} from "@/app/api/bg-cache/route";

const EMAIL = "runner@example.com";
const SECRET = "my-xdrip-secret";

function reading(sgv: number, dateStr: string) {
  return { sgv, date: new Date(dateStr).getTime(), direction: "Flat" };
}

function authedSession() {
  mockAuth.mockResolvedValue({ user: { email: EMAIL } });
}

function postEntries(hash: string, body: unknown) {
  return entriesPOST(
    new Request("http://localhost/api/v1/entries", {
      method: "POST",
      headers: { "api-secret": hash, "content-type": "application/json" },
      body: JSON.stringify(body),
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
      sql: "SELECT COUNT(*) as cnt FROM xdrip_readings WHERE email = ? AND ts >= ? AND ts < ?",
      args: [email, start, end],
    });
    return result.rows[0].cnt as number;
  }
  const result = await testDb().execute({
    sql: "SELECT COUNT(*) as cnt FROM xdrip_readings WHERE email = ?",
    args: [email],
  });
  return result.rows[0].cnt as number;
}

beforeAll(async () => {
  await testDb().executeMultiple(SCHEMA_DDL);
});

beforeEach(async () => {
  await testDb().execute("DELETE FROM user_settings");
  await testDb().execute("DELETE FROM xdrip_auth");
  await testDb().execute("DELETE FROM xdrip_readings");
  await testDb().execute("DELETE FROM bg_cache");
  await testDb().execute("DELETE FROM run_analysis");
  mockAuth.mockReset();
});

// ---------------------------------------------------------------------------
// Full pipeline: settings → entries POST → xDrip GET
// ---------------------------------------------------------------------------
describe("end-to-end: settings → entries → xDrip GET", () => {
  it("sets xdripSecret via settings, posts readings, reads them back", async () => {
    authedSession();

    // 1. Save xDrip secret through settings route
    const putRes = await putSettings({ xdripSecret: SECRET });
    expect(putRes.status).toBe(200);

    // 2. Verify auth mapping works
    const hash = sha1(SECRET);
    expect(await lookupXdripUser(hash)).toBe(EMAIL);

    // 3. POST readings via entries route
    const res = await postEntries(hash, [
      reading(145, "2026-02-20T10:00:00Z"),
      reading(155, "2026-02-20T10:05:00Z"),
      reading(160, "2026-02-20T10:10:00Z"),
    ]);
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(3);

    // 4. Verify readings stored in DB
    expect(await countReadings(EMAIL, "2026-02")).toBe(3);

    // 5. GET readings back via xDrip route
    const getRes = await xdripGET();
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
    await saveXdripAuth(EMAIL, SECRET);
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
    await saveXdripAuth(EMAIL, SECRET);
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
    await saveXdripAuth(EMAIL, SECRET);
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
    await saveXdripAuth(EMAIL, SECRET);
    const hash = sha1(SECRET);

    await postEntries(hash, [
      reading(145, "2026-02-20T10:00:00Z"),
      reading(160, "2026-02-20T10:10:00Z"),
    ]);
    await postEntries(hash, [
      reading(155, "2026-02-20T10:05:00Z"), // between existing
    ]);

    const readings = await getXdripReadings(EMAIL, ["2026-02"]);
    expect(readings).toHaveLength(3);
    expect(readings[0].ts).toBeLessThan(readings[1].ts);
    expect(readings[1].ts).toBeLessThan(readings[2].ts);
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

  it("entries POST: unknown api-secret → 401", async () => {
    const res = await postEntries("unknown-hash", [
      reading(145, "2026-02-20T10:00:00Z"),
    ]);
    expect(res.status).toBe(401);
  });

  it("xDrip GET: no session → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await xdripGET()).status).toBe(401);
  });

  it("xDrip GET: session without email → 401", async () => {
    mockAuth.mockResolvedValue({ user: {} });
    expect((await xdripGET()).status).toBe(401);
  });

  it("settings GET: no session → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await settingsGET()).status).toBe(401);
  });

  it("settings PUT: no session → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await putSettings({ intervalsApiKey: "x" })).status).toBe(401);
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
// Default month range for getXdripReadings
// ---------------------------------------------------------------------------
describe("getXdripReadings default range", () => {
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
        sql: "INSERT INTO xdrip_readings (email, ts, mmol, sgv, direction) VALUES (?, ?, ?, ?, ?)",
        args: [EMAIL, ts, mmol, sgv, "Flat"],
      });
    }

    const readings = await getXdripReadings(EMAIL);
    expect(readings).toHaveLength(2);
    expect(readings.every((r) => r.sgv !== 200)).toBe(true);
  });

  it("reads specific months when provided", async () => {
    await testDb().execute({
      sql: "INSERT INTO xdrip_readings (email, ts, mmol, sgv, direction) VALUES (?, ?, ?, ?, ?)",
      args: [EMAIL, new Date("2025-06-15").getTime(), 8.0, 145, "Flat"],
    });
    await testDb().execute({
      sql: "INSERT INTO xdrip_readings (email, ts, mmol, sgv, direction) VALUES (?, ?, ?, ?, ?)",
      args: [EMAIL, new Date("2025-07-15").getTime(), 8.3, 150, "Flat"],
    });

    const readings = await getXdripReadings(EMAIL, ["2025-06"]);
    expect(readings).toHaveLength(1);
    expect(readings[0].sgv).toBe(145);
  });
});

// ---------------------------------------------------------------------------
// xDrip auth rotation
// ---------------------------------------------------------------------------
describe("xDrip auth rotation", () => {
  it("old hash stops working when secret is rotated", async () => {
    await saveXdripAuth(EMAIL, "secret-v1");
    const hash1 = sha1("secret-v1");
    expect(await lookupXdripUser(hash1)).toBe(EMAIL);

    await saveXdripAuth(EMAIL, "secret-v2");
    const hash2 = sha1("secret-v2");

    expect(await lookupXdripUser(hash1)).toBeNull();
    expect(await lookupXdripUser(hash2)).toBe(EMAIL);
  });
});

// ---------------------------------------------------------------------------
// Settings route
// ---------------------------------------------------------------------------
describe("settings route", () => {
  it("PUT saves and GET retrieves settings", async () => {
    authedSession();

    await putSettings({ intervalsApiKey: "key-123", googleAiApiKey: "gai-456" });

    const res = await settingsGET();
    const data = await res.json();
    expect(data.intervalsApiKey).toBe("key-123");
    expect(data.googleAiApiKey).toBe("gai-456");
  });

  it("PUT with xdripSecret creates auth mapping separately", async () => {
    authedSession();

    await putSettings({
      xdripSecret: "my-secret",
      intervalsApiKey: "key-123",
    });

    // Auth mapping created
    expect(await lookupXdripUser(sha1("my-secret"))).toBe(EMAIL);

    // Other settings saved
    const res = await settingsGET();
    const data = await res.json();
    expect(data.intervalsApiKey).toBe("key-123");
    expect(data.xdripSecret).toBe("my-secret");
  });

  it("PUT with only xdripSecret skips saveUserSettings for other fields", async () => {
    authedSession();
    await putSettings({ xdripSecret: "only-secret" });

    expect(await lookupXdripUser(sha1("only-secret"))).toBe(EMAIL);
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
        glucose: [{ time: 0, value: 10.2 }],
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
    await saveXdripAuth(EMAIL, SECRET);
    const hash = sha1(SECRET);

    const res = await postEntries(hash, []);
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(0);

    expect(await countReadings(EMAIL)).toBe(0);
  });

  it("xDrip GET with no readings returns empty + null trend", async () => {
    authedSession();
    const res = await xdripGET();
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
