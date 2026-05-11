import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  return { holder: { db: null as unknown as Client } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect, the one allowed exception
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

import { SCHEMA_DDL } from "../db";
import { getRunAnalysis, hashRunAnalysisContext, saveRunAnalysis, buildRunHistory } from "../runAnalysisDb";
import type { EnrichedActivity } from "../activityStreamsDb";
import type { IntervalsActivity } from "../types";

const EMAIL = "test@example.com";
const ACTIVITY_ID = "act-1";

describe("runAnalysisDb context-aware cache", () => {
  beforeEach(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
    await holder.db.execute("DELETE FROM run_analysis");
  });

  it("returns cached analysis when the context hash matches", async () => {
    const contextHash = hashRunAnalysisContext("context-a");
    await saveRunAnalysis(EMAIL, ACTIVITY_ID, "Full analysis", contextHash);

    await expect(getRunAnalysis(EMAIL, ACTIVITY_ID, contextHash)).resolves.toBe("Full analysis");
  });

  it("ignores legacy unhashed cache rows when a context hash is required", async () => {
    await holder.db.execute({
      sql: "INSERT INTO run_analysis (email, activity_id, text) VALUES (?, ?, ?)",
      args: [EMAIL, ACTIVITY_ID, "Legacy analysis"],
    });

    await expect(getRunAnalysis(EMAIL, ACTIVITY_ID, hashRunAnalysisContext("context-a"))).resolves.toBeNull();
  });

  it("returns null when the stored context hash does not match", async () => {
    await saveRunAnalysis(EMAIL, ACTIVITY_ID, "Full analysis", hashRunAnalysisContext("context-a"));

    await expect(getRunAnalysis(EMAIL, ACTIVITY_ID, hashRunAnalysisContext("context-b"))).resolves.toBeNull();
  });
});

describe("buildRunHistory", () => {
  it("sets wentHypo to true when any glucose reading is below 4.0", () => {
    const row: EnrichedActivity = {
      activityId: "123",
      category: "easy",
      fuelRate: 60,
      hr: [{ time: 0, value: 150 }],
      glucose: [
        { time: 0, value: 7.0 },
        { time: 5, value: 5.5 },
        { time: 10, value: 3.8 },
        { time: 15, value: 4.2 },
      ],
      activityDate: "2026-04-01",
    };
    const activityMap = new Map<string, IntervalsActivity>();
    const result = buildRunHistory([row], activityMap);
    expect(result).toHaveLength(1);
    expect(result[0].bgSummary.wentHypo).toBe(true);
  });

  it("sets wentHypo to false when all glucose readings are >= 4.0", () => {
    const row: EnrichedActivity = {
      activityId: "123",
      category: "easy",
      fuelRate: 60,
      hr: [{ time: 0, value: 150 }],
      glucose: [
        { time: 0, value: 7.0 },
        { time: 5, value: 5.5 },
        { time: 10, value: 4.0 },
        { time: 15, value: 4.2 },
      ],
      activityDate: "2026-04-01",
    };
    const activityMap = new Map<string, IntervalsActivity>();
    const result = buildRunHistory([row], activityMap);
    expect(result).toHaveLength(1);
    expect(result[0].bgSummary.wentHypo).toBe(false);
  });

  it("sets wentHypo to false when no glucose stream exists", () => {
    const row: EnrichedActivity = {
      activityId: "123",
      category: "easy",
      fuelRate: 60,
      hr: [{ time: 0, value: 150 }],
      glucose: undefined,
      activityDate: "2026-04-01",
    };
    const activityMap = new Map<string, IntervalsActivity>();
    const result = buildRunHistory([row], activityMap);
    expect(result).toHaveLength(1);
    expect(result[0].bgSummary.wentHypo).toBe(false);
  });
});