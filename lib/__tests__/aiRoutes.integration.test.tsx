import { describe, expect, it, vi } from "vitest";

// eslint-disable-next-line no-restricted-syntax -- auth boundary mock
vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { email: "test@example.com" }, expires: "" }),
}));

// eslint-disable-next-line no-restricted-syntax -- credentials boundary mock
vi.mock("@/lib/credentials", () => ({
  getUserCredentials: async () => ({
    intervalsApiKey: "intervals-key",
    nightscoutUrl: null,
    nightscoutSecret: null,
  }),
}));

// eslint-disable-next-line no-restricted-syntax -- settings boundary mock
vi.mock("@/lib/settings", () => ({
  getUserSettings: async () => ({ diabetesMode: true }),
}));

// eslint-disable-next-line no-restricted-syntax -- BG patterns DB boundary mock
vi.mock("@/lib/bgPatternsDb", () => ({
  getBGPatterns: async () => null,
  saveBGPatterns: async () => {},
}));

import { beforeAll } from "vitest";
import { POST as ChatPOST } from "@/app/api/chat/route";
import { POST as BGPatternsPOST } from "@/app/api/bg-patterns/route";
import { POST as RunAnalysisPOST } from "@/app/api/run-analysis/route";

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("/api/chat POST", () => {
  it("returns 400 for malformed JSON", async () => {
    const res = await ChatPOST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON" });
  });
});

describe("/api/bg-patterns POST", () => {
  it("returns 400 for malformed JSON", async () => {
    const res = await BGPatternsPOST(
      new Request("http://localhost/api/bg-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when events field is missing", async () => {
    const res = await BGPatternsPOST(
      new Request("http://localhost/api/bg-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "No events provided" });
  });

  it("returns 400 when events array is empty", async () => {
    const res = await BGPatternsPOST(
      new Request("http://localhost/api/bg-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [] }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "No events provided" });
  });
});

describe("/api/run-analysis POST", () => {
  it("returns 400 for malformed JSON", async () => {
    const res = await RunAnalysisPOST(
      new Request("http://localhost/api/run-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid or empty request body" });
  });

  it("returns 400 when event is missing from body", async () => {
    const res = await RunAnalysisPOST(
      new Request("http://localhost/api/run-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: "act-123" }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "event is required" });
  });
});
