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

async function insertIntervalsCreds() {
  await holder.db.execute({
    sql: `INSERT INTO user_settings (email, intervals_api_key, timezone)
          VALUES (?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET intervals_api_key = excluded.intervals_api_key, timezone = excluded.timezone`,
    args: [
      "test@example.com",
      encrypt("intervals-key", ENC_KEY),
      "Europe/Stockholm",
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
    await holder.db.execute("DELETE FROM workout_event_prescriptions");
    await holder.db.execute("DELETE FROM activity_streams");
    await holder.db.execute("DELETE FROM user_settings");
    await insertIntervalsCreds();
  });

  it("uses the paired workout when computing prescribed carbs", async () => {
    // Pre-insert the stored prescription (would be set at plan time via bulk/replace endpoints).
    await holder.db.execute({
      sql: `INSERT INTO workout_event_prescriptions (email, event_id, planned_duration_sec, prescribed_carbs_g, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ["test@example.com", "202", 56 * 60, 56, Date.now()],
    });

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

  it("uses activity duration fallback when paired event description is unparseable", async () => {
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
      prescribedCarbsG: 94,
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
      {
        activityId: "act-1",
        body: { Rating: "good", FeedbackComment: "solid run" },
      },
      { activityId: "act-1", body: { carbs_ingested: 30 } },
      { activityId: "act-1", body: { PreRunCarbsG: 15 } },
    ]);
  });
});
