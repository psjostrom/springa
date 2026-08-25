import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
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
import {
  getPlannerMetadata,
  savePlannerMetadata,
} from "../plannerMetadata";
import { getUserSettings, saveUserSettings } from "../settings";

const testDb = () => holder.db;
const EMAIL = "planner@example.com";

beforeAll(async () => {
  await testDb().executeMultiple(SCHEMA_DDL);
});

beforeEach(async () => {
  await testDb().execute("DELETE FROM user_settings");
});

describe("planner metadata", () => {
  it("returns empty metadata when no settings row exists", async () => {
    await expect(getPlannerMetadata(EMAIL)).resolves.toEqual({
      generatedPlanConfig: null,
      dirty: false,
    });
  });

  it("roundtrips metadata without exposing it as public settings", async () => {
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: '{"version":4,"raceDist":21}',
      dirty: true,
    });

    await expect(getPlannerMetadata(EMAIL)).resolves.toEqual({
      generatedPlanConfig: '{"version":4,"raceDist":21}',
      dirty: true,
    });
    await expect(getUserSettings(EMAIL)).resolves.not.toHaveProperty(
      "generatedPlanConfig",
    );
  });

  it("clears snapshots and dirty state", async () => {
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: "snapshot",
      dirty: true,
    });
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: null,
      dirty: false,
    });

    await expect(getPlannerMetadata(EMAIL)).resolves.toEqual({
      generatedPlanConfig: null,
      dirty: false,
    });
  });

  it("updates planner dirty state with settings in one save call", async () => {
    await saveUserSettings(
      EMAIL,
      { raceDist: 21.1 },
      { plannerConfigDirty: true },
    );

    const row = await testDb().execute({
      sql: "SELECT race_dist, planner_config_dirty FROM user_settings WHERE email = ?",
      args: [EMAIL],
    });
    expect(row.rows[0]).toMatchObject({
      race_dist: 21.1,
      planner_config_dirty: 1,
    });
  });
});
