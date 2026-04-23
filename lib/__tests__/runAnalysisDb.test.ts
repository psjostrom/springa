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
import { getRunAnalysis, hashRunAnalysisContext, saveRunAnalysis } from "../runAnalysisDb";

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