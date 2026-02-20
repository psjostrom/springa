import { describe, it, expect, vi, beforeEach } from "vitest";

// --- In-memory Redis mock (mimics Upstash JSON serialization) ---
const store = new Map<string, string>();
const mockGet = vi.fn((key: string) => {
  const val = store.get(key);
  return Promise.resolve(val !== undefined ? JSON.parse(val) : null);
});
const mockSet = vi.fn((key: string, value: unknown) => {
  store.set(key, JSON.stringify(value));
  return Promise.resolve("OK");
});
const mockDel = vi.fn((...keys: string[]) => {
  for (const k of keys) store.delete(k);
  return Promise.resolve(keys.length);
});

vi.mock("@upstash/redis", () => ({
  Redis: class {
    get = mockGet;
    set = mockSet;
    del = mockDel;
  },
}));

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

process.env.KV_REST_API_URL = "https://fake.upstash.io";
process.env.KV_REST_API_TOKEN = "fake-token";

import {
  saveXdripAuth,
  lookupXdripUser,
  getXdripReadings,
  monthKey,
  sha1,
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

beforeEach(() => {
  store.clear();
  mockGet.mockClear();
  mockSet.mockClear();
  mockDel.mockClear();
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

    // 4. Verify correct shard in store
    expect(store.has(`xdrip:${EMAIL}:2026-02`)).toBe(true);
    const shard = JSON.parse(store.get(`xdrip:${EMAIL}:2026-02`)!);
    expect(shard).toHaveLength(3);

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
describe("entries route: cross-month sharding", () => {
  it("splits readings into separate monthly shards", async () => {
    await saveXdripAuth(EMAIL, SECRET);
    const hash = sha1(SECRET);

    const res = await postEntries(hash, [
      reading(140, "2026-01-31T23:50:00Z"),
      reading(145, "2026-01-31T23:55:00Z"),
      reading(150, "2026-02-01T00:00:00Z"),
      reading(155, "2026-02-01T00:05:00Z"),
    ]);
    expect(res.status).toBe(200);

    const jan = JSON.parse(store.get(`xdrip:${EMAIL}:2026-01`)!);
    const feb = JSON.parse(store.get(`xdrip:${EMAIL}:2026-02`)!);
    expect(jan).toHaveLength(2);
    expect(feb).toHaveLength(2);
  });

  it("handles year rollover (Dec → Jan)", async () => {
    await saveXdripAuth(EMAIL, SECRET);
    const hash = sha1(SECRET);

    await postEntries(hash, [
      reading(140, "2025-12-31T23:55:00Z"),
      reading(150, "2026-01-01T00:05:00Z"),
    ]);

    expect(store.has(`xdrip:${EMAIL}:2025-12`)).toBe(true);
    expect(store.has(`xdrip:${EMAIL}:2026-01`)).toBe(true);
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

    const shard = JSON.parse(store.get(`xdrip:${EMAIL}:2026-02`)!);
    expect(shard).toHaveLength(2);
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

    const shard = JSON.parse(store.get(`xdrip:${EMAIL}:2026-02`)!);
    expect(shard).toHaveLength(3);
    expect(shard[0].ts).toBeLessThan(shard[1].ts);
    expect(shard[1].ts).toBeLessThan(shard[2].ts);
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
  it("reads current + previous month, ignores older shards", async () => {
    const now = new Date();
    const curMonth = monthKey(now.getTime());
    const prev = new Date(now);
    prev.setMonth(prev.getMonth() - 1);
    const prevMonth = monthKey(prev.getTime());
    const old = new Date(now);
    old.setMonth(old.getMonth() - 3);
    const oldMonth = monthKey(old.getTime());

    store.set(
      `xdrip:${EMAIL}:${curMonth}`,
      JSON.stringify([{ sgv: 145, mmol: 8.0, ts: now.getTime(), direction: "Flat" }]),
    );
    store.set(
      `xdrip:${EMAIL}:${prevMonth}`,
      JSON.stringify([{ sgv: 140, mmol: 7.8, ts: prev.getTime(), direction: "Flat" }]),
    );
    store.set(
      `xdrip:${EMAIL}:${oldMonth}`,
      JSON.stringify([{ sgv: 200, mmol: 11.1, ts: old.getTime(), direction: "Flat" }]),
    );

    const readings = await getXdripReadings(EMAIL);
    expect(readings).toHaveLength(2);
    expect(readings.every((r) => r.sgv !== 200)).toBe(true);
  });

  it("reads specific months when provided", async () => {
    store.set(
      `xdrip:${EMAIL}:2025-06`,
      JSON.stringify([
        { sgv: 145, mmol: 8.0, ts: new Date("2025-06-15").getTime(), direction: "Flat" },
      ]),
    );
    store.set(
      `xdrip:${EMAIL}:2025-07`,
      JSON.stringify([
        { sgv: 150, mmol: 8.3, ts: new Date("2025-07-15").getTime(), direction: "Flat" },
      ]),
    );

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
  it("entries POST with empty array returns count 0, no shards written", async () => {
    await saveXdripAuth(EMAIL, SECRET);
    const hash = sha1(SECRET);

    const res = await postEntries(hash, []);
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(0);

    // No xdrip shard keys written
    const shardKeys = [...store.keys()].filter((k) => k.startsWith("xdrip:runner"));
    expect(shardKeys).toHaveLength(0);
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
