import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/constants";
import { encrypt } from "@/lib/credentials";
import { capturedActivityPutPayloads, resetCaptures } from "./msw/handlers";

const { holder, state } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  return {
    holder: { db: null as unknown as Client },
    state: {
      authCalls: 0,
    },
  };
});

const ENC_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY!;

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

// eslint-disable-next-line no-restricted-syntax -- auth boundary mock
vi.mock("@/lib/auth", () => ({
  auth: async () => {
    state.authCalls += 1;
    return { user: { email: "test@example.com" }, expires: "" };
  },
}));

import { GET, POST } from "@/app/api/run-feedback/route";
import { server } from "./msw/server";
import { SCHEMA_DDL } from "../db";
import { getWorkoutProtocol } from "@/lib/workoutProtocolDb";

async function insertIntervalsCreds() {
  // current_ability_dist + current_ability_secs give the user a thresholdPace,
  // which the calibration gate in run-feedback requires before computing any
  // prescription. Without them the route returns prescribedCarbsG: null.
  await holder.db.execute({
    sql: `INSERT INTO user_settings (
            email, intervals_api_key, timezone,
            current_ability_dist, current_ability_secs
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            intervals_api_key = excluded.intervals_api_key,
            timezone = excluded.timezone,
            current_ability_dist = excluded.current_ability_dist,
            current_ability_secs = excluded.current_ability_secs`,
    args: [
      "test@example.com",
      encrypt("intervals-key", ENC_KEY),
      "Europe/Stockholm",
      21097,
      6600,
    ],
  });
}

describe("/api/run-feedback", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(() => {
    state.authCalls = 0;
    resetCaptures();
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM prerun_carbs");
    await holder.db.execute("DELETE FROM activity_streams");
    await holder.db.execute("DELETE FROM workout_protocols");
    await holder.db.execute("DELETE FROM user_settings");
    await insertIntervalsCreds();
  });

  it("computes prescribed carbs live from the paired workout's description and fuel rate", async () => {
    server.use(
      http.get(`${API_BASE}/activity/:activityId`, ({ params }) => {
        if (params.activityId !== "act-1")
          return new HttpResponse(null, { status: 404 });
        return HttpResponse.json({
          id: "act-1",
          start_date: "2026-05-02T16:10:00Z",
          start_date_local: "2026-05-02T18:10:00",
          name: "W12 Easy",
          type: "Run",
          distance: 8100,
          moving_time: 54 * 60 + 10,
          average_hr: 142,
          paired_event_id: 202,
        });
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 101,
            category: "WORKOUT",
            start_date_local: "2026-05-02T08:00:00",
            name: "W12 Long",
            description: "- 94m 68-83% pace intensity=active",
            carbs_per_hour: 60,
          },
          {
            id: 202,
            category: "WORKOUT",
            start_date_local: "2026-05-02T18:00:00",
            name: "W12 Easy",
            description: "- 56m 68-83% pace intensity=active",
            carbs_per_hour: 60,
          },
        ]);
      }),
    );

    const res = await GET(
      new Request("http://localhost/api/run-feedback?activityId=act-1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      activityId: "act-1",
      prescribedCarbsG: 56,
      distance: 8100,
      avgHr: 142,
    });
  });

  it("populates protocol note and preRunCarbsG from Turso when activity has protocol", async () => {
    await holder.db.execute({
      sql: `INSERT INTO workout_protocols (
        email, activity_id, before_mode, before_timing, during_same, pre_run_carbs_g, note, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ["test@example.com", "act-proto", "auto", "1-2h", 1, 35, "Turso protocol note", Date.now()],
    });

    server.use(
      http.get(`${API_BASE}/activity/:activityId`, () => {
        return HttpResponse.json({
          id: "act-proto",
          start_date: "2026-05-02T16:10:00Z",
          start_date_local: "2026-05-02T18:10:00",
          name: "W12 Easy",
          type: "Run",
          distance: 8100,
          moving_time: 3000,
          average_hr: 140,
        });
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([]);
      }),
    );

    const res = await GET(
      new Request("http://localhost/api/run-feedback?activityId=act-proto"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      activityId: "act-proto",
      comment: "Turso protocol note",
      preRunCarbsG: 35,
    });
  });

  it("returns null prescribedCarbsG when paired event description is unparseable", async () => {
    await holder.db.execute({
      sql: `INSERT INTO prerun_carbs (email, event_id, carbs_g, created_at)
            VALUES (?, ?, ?, ?)`,
      args: ["test@example.com", "202", 18, Date.now()],
    });

    server.use(
      http.get(`${API_BASE}/activity/:activityId`, ({ params }) => {
        if (params.activityId !== "act-duration")
          return new HttpResponse(null, { status: 404 });
        return HttpResponse.json({
          id: "act-duration",
          type: "Run",
          start_date_local: "2026-05-05T12:00:00",
          start_date: "2026-05-05T10:00:00Z",
          moving_time: 5640,
          paired_event_id: null,
        });
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 202,
            category: "WORKOUT",
            name: "W13 Easy",
            start_date_local: "2026-05-05T10:00:00",
            description: "legacy free text with no step format",
            carbs_per_hour: 60,
            paired_activity_id: "act-duration",
          },
        ]);
      }),
    );

    const res = await GET(
      new Request("http://localhost/api/run-feedback?activityId=act-duration"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      activityId: "act-duration",
      prescribedCarbsG: null,
      preRunCarbsG: 18,
    });
  });

  it("returns null prescription instead of failing when paired event description is malformed", async () => {
    server.use(
      http.get(`${API_BASE}/activity/:activityId`, ({ params }) => {
        if (params.activityId !== "act-malformed")
          return new HttpResponse(null, { status: 404 });
        return HttpResponse.json({
          id: "act-malformed",
          type: "Run",
          start_date_local: "2026-05-05T12:00:00",
          start_date: "2026-05-05T10:00:00Z",
          moving_time: 5640,
          paired_event_id: null,
        });
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 303,
            category: "WORKOUT",
            name: "W13 Easy",
            start_date_local: "2026-05-05T10:00:00",
            description: { malformed: true },
            carbs_per_hour: 60,
            paired_activity_id: "act-malformed",
          },
        ]);
      }),
    );

    const res = await GET(
      new Request("http://localhost/api/run-feedback?activityId=act-malformed"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      activityId: "act-malformed",
      prescribedCarbsG: null,
      preRunCarbsG: null,
    });
  });

  it("does not guess a prescribed total from an unpaired nearby workout", async () => {
    server.use(
      http.get(`${API_BASE}/activity/:activityId`, ({ params }) => {
        if (params.activityId !== "act-unpaired")
          return new HttpResponse(null, { status: 404 });
        return HttpResponse.json({
          id: "act-unpaired",
          start_date: "2026-05-05T08:10:00Z",
          start_date_local: "2026-05-05T10:10:00",
          name: "W13 Easy",
          type: "Run",
          distance: 7600,
          moving_time: 3200,
          average_hr: 140,
          paired_event_id: null,
        });
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 104924872,
            category: "WORKOUT",
            start_date_local: "2026-05-02T12:00:00",
            name: "W12 Long (8km) [RECOVERY]",
            description: "Warmup\n- 1km 68-83% pace\n",
            carbs_per_hour: 56,
          },
          {
            id: 104924874,
            category: "WORKOUT",
            start_date_local: "2026-05-05T10:00:00",
            name: "W13 Easy",
            description:
              "Warmup\n- 10m 68-83% pace\n\nMain set\n- 27m 68-83% pace\n\nCooldown\n- 15m 68-83% pace\n",
            carbs_per_hour: 64,
          },
        ]);
      }),
    );

    const res = await GET(
      new Request("http://localhost/api/run-feedback?activityId=act-unpaired"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      activityId: "act-unpaired",
      prescribedCarbsG: null,
    });
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid or empty request body",
    });
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: "" }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Missing activityId or rating",
    });
  });

  it("writes feedback and optional carb fields", async () => {
    const res = await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-1",
          rating: "good",
          comment: "solid run",
          carbsG: 30,
          preRunCarbsG: 15,
        }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(capturedActivityPutPayloads).toEqual([
      { activityId: "act-1", body: { carbs_ingested: 30 } },
    ]);
    const saved = await getWorkoutProtocol("test@example.com", "act-1");
    expect(saved).toMatchObject({
      activityId: "act-1",
      hasProtocol: false,
      status: "rated",
      preRunCarbsG: 15,
      note: "solid run",
    });
  });

  it("returns a JSON error when Intervals rejects the write", async () => {
    server.use(
      http.put(`${API_BASE}/activity/:activityId`, () =>
        HttpResponse.json({ error: "Rate limit exceeded" }, { status: 422 }),
      ),
    );

    const res = await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: "act-1", carbsG: 30 }),
      }),
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("Failed to update activity carbs"),
    });
  });

  it("saves a structured CamAPS protocol to Turso without writing to Intervals custom fields", async () => {
    const res = await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-camaps-1",
          protocol: {
            beforeMode: "auto",
            beforeAutoSubmode: "ease_off",
            beforeTargetBg: 8.5,
            beforeTiming: "1-2h",
            duringSame: true,
            preRunCarbsG: 15,
            rescueCarbsG: 0,
            note: "Warm humid evening",
          },
        }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(capturedActivityPutPayloads).toEqual([]);

    const saved = await getWorkoutProtocol("test@example.com", "act-camaps-1");
    expect(saved).toMatchObject({
      activityId: "act-camaps-1",
      beforeMode: "auto",
      beforeAutoSubmode: "ease_off",
      beforeTargetBg: 8.5,
      beforeTiming: "1-2h",
      duringSame: true,
      preRunCarbsG: 15,
      rescueCarbsG: 0,
      note: "Warm humid evening",
    });
  });

  it("persists feel-only POST to Turso without writing feel to Intervals", async () => {
    const res = await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-feel-only",
          feel: 3,
        }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    // No Intervals PUT — feel is Turso-only
    expect(capturedActivityPutPayloads).toEqual([]);

    const saved = await getWorkoutProtocol("test@example.com", "act-feel-only");
    expect(saved).toMatchObject({
      activityId: "act-feel-only",
      feel: 3,
    });
  });

  it("rejects feel outside 1-5 range", async () => {
    const res = await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-1",
          feel: 7,
        }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "feel must be an integer from 1 to 5",
    });
  });

  it("rejects rpe outside 1-10 range", async () => {
    const res = await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-1",
          feel: 3,
          rpe: 15,
        }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "rpe must be an integer from 1 to 10",
    });
  });

  it("accepts RPE-only POST and suppresses protocol in GET response", async () => {
    server.use(
      http.get(`${API_BASE}/activity/:activityId`, () => {
        return HttpResponse.json({
          id: "act-rpe-only",
          start_date: "2026-05-02T16:10:00Z",
          start_date_local: "2026-05-02T18:10:00",
          name: "W12 Easy",
          type: "Run",
          distance: 5000,
          moving_time: 1800,
        });
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => HttpResponse.json([])),
    );

    const postRes = await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-rpe-only",
          rpe: 7,
        }),
      }),
    );

    expect(postRes.status).toBe(200);
    await expect(postRes.json()).resolves.toEqual({ ok: true });

    const saved = await getWorkoutProtocol("test@example.com", "act-rpe-only");
    expect(saved).toMatchObject({
      activityId: "act-rpe-only",
      hasProtocol: false,
      beforeMode: null,
      beforeTiming: null,
      rpe: 7,
    });

    const getRes = await GET(
      new Request("http://localhost/api/run-feedback?activityId=act-rpe-only"),
    );
    expect(getRes.status).toBe(200);
    await expect(getRes.json()).resolves.toMatchObject({
      activityId: "act-rpe-only",
      rpe: 7,
      protocol: null,
      hasFeedback: true,
    });
  });

  it("preserves existing note when comment is absent in subsequent update", async () => {
    await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-note-preserve",
          feel: 4,
          comment: "Initial great note",
        }),
      }),
    );

    // Update feel without sending comment
    await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-note-preserve",
          feel: 5,
        }),
      }),
    );

    const saved = await getWorkoutProtocol("test@example.com", "act-note-preserve");
    expect(saved).toMatchObject({
      feel: 5,
      note: "Initial great note",
    });
  });

  it("updates note in Turso on rating-only submission with comment", async () => {
    const res = await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-rating-note",
          rating: "good",
          comment: "Rating note only",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const saved = await getWorkoutProtocol("test@example.com", "act-rating-note");
    expect(saved).toMatchObject({
      activityId: "act-rating-note",
      hasProtocol: false,
      note: "Rating note only",
    });
  });

  it("preserves existing feel and rpe when omitted in protocol update", async () => {
    // 1. Initial feel and rpe submission
    await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-feel-rpe-preserve",
          feel: 4,
          rpe: 6,
        }),
      }),
    );

    // 2. Submit protocol update omitting feel and rpe
    await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-feel-rpe-preserve",
          protocol: {
            beforeMode: "auto",
            beforeAutoSubmode: "ease_off",
            beforeTiming: "1-2h",
            duringSame: true,
          },
        }),
      }),
    );

    const saved = await getWorkoutProtocol("test@example.com", "act-feel-rpe-preserve");
    expect(saved).toMatchObject({
      activityId: "act-feel-rpe-preserve",
      hasProtocol: true,
      beforeMode: "auto",
      feel: 4,
      rpe: 6,
    });
  });

  it("preserves existing protocol data, category, preRunCarbsG, and hasProtocol when marked skipped", async () => {
    // 1. Initial structured protocol submission
    await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-skip-preserve",
          category: "easy",
          preRunCarbsG: 20,
          protocol: {
            beforeMode: "auto",
            beforeAutoSubmode: "ease_off",
            beforeTiming: "1-2h",
            duringSame: true,
          },
        }),
      }),
    );

    // 2. Mark skipped
    const skipRes = await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-skip-preserve",
          status: "skipped",
        }),
      }),
    );
    expect(skipRes.status).toBe(200);

    const saved = await getWorkoutProtocol("test@example.com", "act-skip-preserve");
    expect(saved).toMatchObject({
      activityId: "act-skip-preserve",
      hasProtocol: true,
      status: "skipped",
      category: "easy",
      beforeMode: "auto",
      beforeTiming: "1-2h",
      preRunCarbsG: 20,
      feel: null,
      rpe: null,
    });
  });

  it("merges existing protocol fields and retains explicit null category and preRunCarbsG on structured update", async () => {
    // 1. Initial structured protocol submission
    await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-struct-merge",
          category: "long",
          preRunCarbsG: 30,
          protocol: {
            beforeMode: "auto",
            beforeAutoSubmode: "ease_off",
            beforeTiming: "1-2h",
            duringSame: true,
            note: "Existing note",
          },
        }),
      }),
    );

    // 2. Subsequent structured update: omit category and preRunCarbsG
    await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-struct-merge",
          protocol: {
            beforeMode: "manual",
            beforeTiming: "<30m",
            duringSame: false,
          },
        }),
      }),
    );

    let saved = await getWorkoutProtocol("test@example.com", "act-struct-merge");
    expect(saved).toMatchObject({
      activityId: "act-struct-merge",
      hasProtocol: true,
      category: "long",
      preRunCarbsG: 30,
      beforeMode: "manual",
      beforeTiming: "<30m",
      duringSame: false,
      note: "Existing note",
    });

    // 3. Explicit null for category and preRunCarbsG
    await POST(
      new Request("http://localhost/api/run-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: "act-struct-merge",
          category: null,
          preRunCarbsG: null,
          protocol: {
            beforeMode: "manual",
            beforeTiming: "<30m",
            duringSame: false,
          },
        }),
      }),
    );

    saved = await getWorkoutProtocol("test@example.com", "act-struct-merge");
    expect(saved).toMatchObject({
      activityId: "act-struct-merge",
      category: null,
      preRunCarbsG: null,
    });
  });

  it("finds latest unrated run and includes its Turso protocol in the response", async () => {
    const today = new Date().toISOString().slice(0, 10);
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([
          {
            id: "act-unrated-latest",
            start_date: `${today}T10:00:00Z`,
            start_date_local: `${today}T12:00:00`,
            name: "Morning Run",
            type: "Run",
            distance: 6000,
            moving_time: 1800,
          },
        ]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => HttpResponse.json([])),
    );

    await holder.db.execute({
      sql: `INSERT INTO workout_protocols (
        email, activity_id, has_protocol, before_mode, before_timing, pre_run_carbs_g, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: ["test@example.com", "act-unrated-latest", 1, "auto", "1-2h", 25, Date.now()],
    });

    const res = await GET(new Request("http://localhost/api/run-feedback"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;

    expect(json.activityId).toBe("act-unrated-latest");
    expect(json.preRunCarbsG).toBe(25);
    expect(json.protocol).toMatchObject({
      activityId: "act-unrated-latest",
      beforeMode: "auto",
      beforeTiming: "1-2h",
      preRunCarbsG: 25,
    });
  });
});
