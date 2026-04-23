import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";

const { holder, aiCalls } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  return {
    holder: { db: null as unknown as Client },
    aiCalls: { count: 0 },
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
  auth: () => Promise.resolve({ user: { email: "test@example.com" }, expires: "" }),
}));

// eslint-disable-next-line no-restricted-syntax -- third-party AI boundary
vi.mock("ai", () => ({
  generateText: async () => {
    aiCalls.count += 1;
    return { text: aiCalls.count === 1 ? "First analysis" : "Updated analysis" };
  },
}));

// eslint-disable-next-line no-restricted-syntax -- third-party AI boundary
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => () => ({ provider: "anthropic" }),
}));

import { POST } from "@/app/api/run-analysis/route";
import { SCHEMA_DDL } from "../db";
import { encrypt } from "../credentials";

const EMAIL = "test@example.com";

const requestBody = {
  activityId: "act-1",
  event: {
    id: "activity-act-1",
    activityId: "act-1",
    date: "2026-04-10T08:00:00.000Z",
    name: "Easy Run",
    description: "",
    type: "completed",
    category: "easy",
    distance: 6500,
    duration: 2700,
    avgHr: 145,
  },
  regenerate: false,
};

describe("/api/run-analysis", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    aiCalls.count = 0;
    await holder.db.executeMultiple(SCHEMA_DDL);
    await holder.db.execute("DELETE FROM run_analysis");
    await holder.db.execute("DELETE FROM user_settings");
    await holder.db.execute("DELETE FROM activity_streams");
    await holder.db.execute("DELETE FROM bg_patterns");
    await holder.db.execute({
      sql: `INSERT INTO user_settings (email, diabetes_mode, intervals_api_key, timezone)
            VALUES (?, ?, ?, ?)`,
      args: [
        EMAIL,
        0,
        encrypt("intervals-key", process.env.CREDENTIALS_ENCRYPTION_KEY!),
        "Europe/Stockholm",
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("regenerates when server-fetched prompt inputs change", async () => {
    let athleteCallCount = 0;

    server.use(
      http.get("https://intervals.icu/api/v1/athlete/0", () => {
        athleteCallCount += 1;
        const lthr = athleteCallCount === 1 ? 170 : 176;
        return HttpResponse.json({
          icu_resting_hr: 50,
          sportSettings: [
            { id: 1, types: ["Run"], lthr, max_hr: 190, hr_zones: [130, 145, 160, 175, 190] },
          ],
        });
      }),
      http.get("https://intervals.icu/api/v1/athlete/0/wellness", () => HttpResponse.json([])),
      http.get("https://intervals.icu/api/v1/athlete/0/activities", () => HttpResponse.json([])),
    );

    const firstResponse = await POST(
      new Request("http://localhost/api/run-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }),
    );

    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toEqual({ analysis: "First analysis" });

    const secondResponse = await POST(
      new Request("http://localhost/api/run-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }),
    );

    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toEqual({ analysis: "Updated analysis" });
    expect(aiCalls.count).toBe(2);
  });
});