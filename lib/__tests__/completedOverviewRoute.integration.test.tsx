import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/constants";
import { encrypt } from "@/lib/credentials";
import { resetCaptures } from "./msw/handlers";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  return { holder: { db: null as unknown as Client } };
});

const ENC_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY!;
const EMAIL = "test@example.com";
const NS_URL = "https://ns.example.com";
const RUN_START_MS = Date.parse("2026-05-02T16:10:00Z");

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

// eslint-disable-next-line no-restricted-syntax -- auth boundary mock
vi.mock("@/lib/auth", () => ({
  auth: async () => {
    return { user: { email: EMAIL }, expires: "" };
  },
}));

import { GET } from "@/app/api/intervals/activity/[id]/overview/route";
import { server } from "./msw/server";
import { SCHEMA_DDL } from "../db";

// --- Fixtures ---

// 54-minute easy run (3240 s), 8.1 km, Z2-heavy zone times.
function richActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: "act-rich",
    start_date: "2026-05-02T16:10:00Z",
    start_date_local: "2026-05-02T18:10:00",
    name: "W12 Easy",
    type: "Run",
    distance: 8100,
    moving_time: 3240,
    average_hr: 142,
    icu_hr_zone_times: [120, 2400, 400, 200, 120],
    paired_event_id: 202,
    ...overrides,
  };
}

// Per-second streams for the 54-minute run: constant 2.5 m/s (6:40/km),
// HR drifting 138→143, altitude rising 1 m per split.
function richStreams() {
  const seconds = 3240;
  const time: number[] = [];
  const heartrate: number[] = [];
  const distance: number[] = [];
  const altitude: number[] = [];
  for (let s = 0; s < seconds; s++) {
    time.push(s);
    heartrate.push(138 + Math.floor(s / 500));
    distance.push(Math.round(((s / seconds) * 8100) * 10) / 10);
    altitude.push(40 + Math.floor(s / 200));
  }
  return [
    { type: "time", data: time },
    { type: "heartrate", data: heartrate },
    { type: "velocity_smooth", data: Array(seconds).fill(2.5) },
    { type: "cadence", data: Array(seconds).fill(85) },
    { type: "altitude", data: altitude },
    { type: "distance", data: distance },
  ];
}

// Flat 8.0 mmol/L CGM readings every 5 min from 60 min before to 170 min after start.
function nsReadings() {
  const readings: { sgv: number; date: number; direction: string; delta: number }[] = [];
  for (let min = -60; min <= 170; min += 5) {
    readings.push({ sgv: 144, date: RUN_START_MS + min * 60000, direction: "Flat", delta: 0 });
  }
  return readings;
}

function overviewRequest(activityId: string) {
  return GET(
    new Request(`http://localhost/api/intervals/activity/${activityId}/overview`),
    { params: Promise.resolve({ id: activityId }) },
  );
}

async function insertCreds(opts: { diabetesMode?: boolean; nsUrl?: string | null } = {}) {
  await holder.db.execute({
    sql: `INSERT INTO user_settings (
            email, intervals_api_key, nightscout_url, nightscout_secret, timezone, diabetes_mode
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            intervals_api_key = excluded.intervals_api_key,
            nightscout_url = excluded.nightscout_url,
            nightscout_secret = excluded.nightscout_secret,
            timezone = excluded.timezone,
            diabetes_mode = excluded.diabetes_mode`,
    args: [
      EMAIL,
      encrypt("intervals-key", ENC_KEY),
      opts.nsUrl ?? NS_URL,
      encrypt("secret", ENC_KEY),
      "Europe/Stockholm",
      opts.diabetesMode ? 1 : 0,
    ],
  });
}

function stubActivity(activity: Record<string, unknown>, status = 200) {
  server.use(
    http.get(`${API_BASE}/activity/:activityId`, ({ params }) => {
      if (params.activityId !== activity.id) {
        return new HttpResponse(null, { status: 404 });
      }
      return status === 200
        ? HttpResponse.json(activity)
        : new HttpResponse(null, { status });
    }),
  );
}

function stubStreams(streams: unknown[] | null) {
  server.use(
    http.get(`${API_BASE}/activity/:activityId/streams`, () => {
      return streams === null
        ? new HttpResponse(null, { status: 500 })
        : HttpResponse.json(streams);
    }),
  );
}

function stubNightscout(entries: unknown[] | null) {
  server.use(
    http.get(`${NS_URL}/api/v1/entries.json`, () => {
      return entries === null
        ? new HttpResponse(null, { status: 500 })
        : HttpResponse.json(entries);
    }),
  );
}

function stubEvents(events: unknown[]) {
  server.use(http.get(`${API_BASE}/athlete/0/events`, () => HttpResponse.json(events)));
}

describe("GET /api/intervals/activity/[id]/overview", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(() => {
    resetCaptures();
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM prerun_carbs");
    await holder.db.execute("DELETE FROM user_settings");
    await insertCreds({ diabetesMode: true });
  });

  it("returns a rich overview with report card, splits, and activity pre-run source", async () => {
    stubActivity(richActivity({ PreRunCarbsG: 30 }));
    stubStreams(richStreams());
    stubNightscout(nsReadings());

    const res = await overviewRequest("act-rich");

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual([
      "activityId",
      "preRunCarbs",
      "reportCard",
      "splits",
    ]);

    expect(json.activityId).toBe("act-rich");

    const reportCard = json.reportCard as Record<string, unknown>;
    expect(reportCard.bg).toEqual({
      rating: "good",
      startBG: 8,
      minBG: 8,
      hypo: false,
      worstRate: 0,
      lbgi: 0,
    });
    expect(reportCard.hrZone).toMatchObject({ rating: "good", targetZone: "Z2" });
    expect((reportCard.hrZone as { pctInTarget: number }).pctInTarget).toBeCloseTo(74.07, 1);
    expect(reportCard.entryTrend).toEqual({
      rating: "good",
      slope30m: 0,
      stability: 0,
      label: "Stable",
    });
    expect(reportCard.recovery).toEqual({
      rating: "good",
      drop30m: 0,
      nadir: 8,
      postHypo: false,
      label: "Clean",
    });

    expect(json.splits).toHaveLength(8);
    expect((json.splits as unknown[])[0]).toEqual({
      km: 1,
      paceMinPerKm: 6.67,
      avgHr: 138,
      elevationChangeM: 1,
    });

    expect(json.preRunCarbs).toEqual({
      grams: 30,
      source: "activity",
      fallbackEventId: null,
    });

    // No raw stream arrays or CGM readings in the response body.
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain("heartrate");
    expect(serialized).not.toContain("glucose");
    expect(serialized).not.toContain("rawTime");
    expect(serialized).not.toContain("velocity_smooth");
  });

  it("skips BG-derived fields when diabetes mode is off", async () => {
    await insertCreds({ diabetesMode: false });
    stubActivity(richActivity());
    stubStreams(richStreams());

    const res = await overviewRequest("act-rich");

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const reportCard = json.reportCard as Record<string, unknown>;
    expect(reportCard.bg).toBeNull();
    expect(reportCard.entryTrend).toBeNull();
    expect(reportCard.recovery).toBeNull();
    expect(reportCard.hrZone).toMatchObject({ rating: "good", targetZone: "Z2" });
    expect(json.splits).toHaveLength(8);
  });

  it("degrades only BG-derived fields when Nightscout fails", async () => {
    stubActivity(richActivity());
    stubStreams(richStreams());
    stubNightscout(null);

    const res = await overviewRequest("act-rich");

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const reportCard = json.reportCard as Record<string, unknown>;
    expect(reportCard.bg).toBeNull();
    expect(reportCard.entryTrend).toBeNull();
    expect(reportCard.recovery).toBeNull();
    expect(reportCard.hrZone).toMatchObject({ rating: "good" });
    expect(json.splits).toHaveLength(8);
  });

  it("skips BG fields entirely when Nightscout is not configured", async () => {
    await insertCreds({ diabetesMode: true, nsUrl: null });
    stubActivity(richActivity());
    stubStreams(richStreams());

    const res = await overviewRequest("act-rich");

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const reportCard = json.reportCard as Record<string, unknown>;
    expect(reportCard.bg).toBeNull();
    expect(reportCard.entryTrend).toBeNull();
    expect(reportCard.recovery).toBeNull();
    expect(reportCard.hrZone).toMatchObject({ rating: "good" });
  });

  it("degrades splits and BG alignment but keeps HR-independent context when streams fail", async () => {
    stubActivity(richActivity());
    stubStreams(null);
    stubNightscout(nsReadings());

    const res = await overviewRequest("act-rich");

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.splits).toBeNull();
    const reportCard = json.reportCard as Record<string, unknown>;
    expect(reportCard.bg).toBeNull();
    expect(reportCard.hrZone).toMatchObject({ rating: "good" });
    expect(reportCard.entryTrend).toMatchObject({ rating: "good", label: "Stable" });
    expect(reportCard.recovery).toMatchObject({ rating: "good", label: "Clean" });
  });

  it("returns the paired-event pre-run source when only the fallback row exists", async () => {
    await holder.db.execute({
      sql: `INSERT INTO prerun_carbs (email, event_id, carbs_g, created_at)
            VALUES (?, ?, ?, ?)`,
      args: [EMAIL, "202", 18, Date.now()],
    });
    stubActivity(richActivity());
    stubStreams(richStreams());
    stubNightscout(nsReadings());

    const res = await overviewRequest("act-rich");

    expect(res.status).toBe(200);
    const json = (await res.json()) as { preRunCarbs: Record<string, unknown> };
    expect(json.preRunCarbs).toEqual({
      grams: 18,
      source: "paired-event",
      fallbackEventId: 202,
    });
  });

  it("reports pre-run source 'none' without guessing when no authoritative event exists", async () => {
    stubActivity(
      richActivity({
        PreRunCarbsG: undefined,
        paired_event_id: null,
      }),
    );
    stubEvents([]);

    const res = await overviewRequest("act-rich");

    expect(res.status).toBe(200);
    const json = (await res.json()) as { preRunCarbs: Record<string, unknown> };
    expect(json.preRunCarbs).toEqual({
      grams: null,
      source: "none",
      fallbackEventId: null,
    });
  });

  it("returns 400 for an invalid activity ID", async () => {
    const res = await overviewRequest("bad id!");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid activity ID" });
  });

  it("returns 400 when Intervals credentials are missing", async () => {
    await holder.db.execute("DELETE FROM user_settings");
    await holder.db.execute(
      "INSERT INTO user_settings (email) VALUES (?)",
      [EMAIL],
    );

    const res = await overviewRequest("act-rich");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Intervals.icu not configured",
    });
  });

  it("returns 404 when the activity is not found upstream", async () => {
    stubActivity(richActivity(), 404);

    const res = await overviewRequest("act-rich");

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Activity not found" });
  });

  it("returns 502 when the required activity fetch fails upstream", async () => {
    stubActivity(richActivity(), 500);

    const res = await overviewRequest("act-rich");

    expect(res.status).toBe(502);
  });
});