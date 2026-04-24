import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authCalls: 0,
  feedbackCalls: [] as { activityId: string; rating: string; comment?: string }[],
  carbsCalls: [] as { activityId: string; carbsG: number }[],
  preRunCalls: [] as { activityId: string; preRunCarbsG: number }[],
}));

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
  fetchActivityById: async () => null,
  fetchActivitiesByDateRange: async () => [],
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

import { POST } from "@/app/api/run-feedback/route";

describe("/api/run-feedback POST", () => {
  beforeEach(() => {
    state.authCalls = 0;
    state.feedbackCalls = [];
    state.carbsCalls = [];
    state.preRunCalls = [];
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
