import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/constants";

const { holder, state } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  return {
    holder: { db: null as unknown as Client },
    state: {
      authCalls: 0,
      activityById: null as unknown,
      activitiesByDateRange: [] as unknown[],
      feedbackCalls: [] as { activityId: string; rating: string; comment?: string }[],
      carbsCalls: [] as { activityId: string; carbsG: number }[],
      preRunCalls: [] as { activityId: string; preRunCarbsG: number }[],
    },
  };
});

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

// eslint-disable-next-line no-restricted-syntax -- credentials boundary mock
vi.mock("@/lib/credentials", () => ({
  getUserCredentials: async () => ({ intervalsApiKey: "intervals-key" }),
}));

// eslint-disable-next-line no-restricted-syntax -- external API boundary mock
vi.mock("@/lib/intervalsApi", () => ({
  fetchActivityById: async (_apiKey: string, activityId: string) => {
    const activity = state.activityById as { id?: string } | null;
    return activity?.id === activityId ? activity : null;
  },
  fetchActivitiesByDateRange: async () => state.activitiesByDateRange,
  fetchAthleteProfile: async () => ({}),
  updateActivityFeedback: async (_apiKey: string, activityId: string, rating: string, comment?: string) => {
    state.feedbackCalls.push({ activityId, rating, comment });
  },
  updateActivityCarbs: async (_apiKey: string, activityId: string, carbsG: number) => {
    state.carbsCalls.push({ activityId, carbsG });
  },
  updateActivityPreRunCarbs: async (_apiKey: string, activityId: string, preRunCarbsG: number) => {
    state.preRunCalls.push({ activityId, preRunCarbsG });
  },
  authHeader: () => "Bearer test",
}));

import { GET, POST } from "@/app/api/run-feedback/route";
import { server } from "./msw/server";
import { SCHEMA_DDL } from "../db";

describe("/api/run-feedback", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(() => {
    state.authCalls = 0;
    state.activityById = null;
    state.activitiesByDateRange = [];
    state.feedbackCalls = [];
    state.carbsCalls = [];
    state.preRunCalls = [];
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM prerun_carbs");
    await holder.db.execute("DELETE FROM activity_streams");
    await holder.db.execute("DELETE FROM user_settings");
  });

  it("uses the paired workout when computing prescribed carbs", async () => {
    state.activityById = {
      id: "act-1",
      start_date: "2026-05-02T16:10:00Z",
      start_date_local: "2026-05-02T18:10:00",
      name: "W12 Easy",
      type: "Run",
      distance: 8100,
      moving_time: 54 * 60 + 10,
      average_hr: 142,
      paired_event_id: 202,
    };

    server.use(
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

    const res = await GET(new Request("http://localhost/api/run-feedback?activityId=act-1"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      activityId: "act-1",
      prescribedCarbsG: 56,
      distance: 8100,
      avgHr: 142,
    });
  });

  it("does not guess a prescribed total from an unpaired nearby workout", async () => {
    state.activityById = {
      id: "act-unpaired",
      start_date: "2026-05-05T08:10:00Z",
      start_date_local: "2026-05-05T10:10:00",
      name: "W13 Easy",
      type: "Run",
      distance: 7600,
      moving_time: 3200,
      average_hr: 140,
      paired_event_id: null,
    };

    server.use(
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
            description: "Warmup\n- 10m 68-83% pace\n\nMain set\n- 27m 68-83% pace\n\nCooldown\n- 15m 68-83% pace\n",
            carbs_per_hour: 64,
          },
        ]);
      }),
    );

    const res = await GET(new Request("http://localhost/api/run-feedback?activityId=act-unpaired"));

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
    await expect(res.json()).resolves.toEqual({ error: "Invalid or empty request body" });
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
    await expect(res.json()).resolves.toEqual({ error: "Missing activityId or rating" });
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
    expect(state.authCalls).toBe(1);
    expect(state.feedbackCalls).toEqual([{ activityId: "act-1", rating: "good", comment: "solid run" }]);
    expect(state.carbsCalls).toEqual([{ activityId: "act-1", carbsG: 30 }]);
    expect(state.preRunCalls).toEqual([{ activityId: "act-1", preRunCarbsG: 15 }]);
  });
});
