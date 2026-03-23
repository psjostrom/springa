import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { Client } from "@libsql/client";

// vi.hoisted runs before vi.mock hoisting — safe to create the shared db here
const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  return { holder: { db: null as unknown as Client } };
});

vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

import { SCHEMA_DDL } from "../db";
import { getUserSettings, saveUserSettings } from "../settings";

const testDb = () => holder.db;

// Multi-user defaults returned for any existing row
const MULTI_USER_DEFAULTS = {
  approved: false,
  sugarMode: false,
  timezone: "Europe/Stockholm",
  onboardingComplete: false,
  cgmConnected: false,
  mylifeConnected: false,
};

beforeAll(async () => {
  await testDb().executeMultiple(SCHEMA_DDL);
});

beforeEach(async () => {
  await testDb().execute("DELETE FROM user_settings");
});

describe("getUserSettings", () => {
  it("returns empty object when no data stored", async () => {
    const result = await getUserSettings("user@example.com");
    expect(result).toEqual({});
  });

  it("returns stored settings", async () => {
    await testDb().execute({
      sql: "INSERT INTO user_settings (email, race_date) VALUES (?, ?)",
      args: ["user@example.com", "2026-06-13"],
    });

    const result = await getUserSettings("user@example.com");
    expect(result).toMatchObject({
      raceDate: "2026-06-13",
      ...MULTI_USER_DEFAULTS,
    });
  });

  it("only returns fields that have values", async () => {
    await testDb().execute({
      sql: "INSERT INTO user_settings (email, race_name) VALUES (?, ?)",
      args: ["user@example.com", "EcoTrail"],
    });

    const result = await getUserSettings("user@example.com");
    expect(result).toMatchObject({ raceName: "EcoTrail" });
    expect(result).not.toHaveProperty("raceDate");
  });
});

describe("saveUserSettings", () => {
  it("merges partial settings with existing", async () => {
    await saveUserSettings("user@example.com", { raceDate: "2026-06-13" });
    await saveUserSettings("user@example.com", { raceName: "EcoTrail" });

    const result = await getUserSettings("user@example.com");
    expect(result).toMatchObject({
      raceDate: "2026-06-13",
      raceName: "EcoTrail",
    });
  });

  it("creates new entry when none exists", async () => {
    await saveUserSettings("new@user.com", { raceName: "EcoTrail" });

    const result = await getUserSettings("new@user.com");
    expect(result).toMatchObject({ raceName: "EcoTrail" });
  });

  it("overwrites existing key values", async () => {
    await saveUserSettings("user@example.com", {
      raceDate: "2026-06-13",
      raceName: "Old Race",
    });
    await saveUserSettings("user@example.com", { raceName: "EcoTrail" });

    const result = await getUserSettings("user@example.com");
    expect(result).toMatchObject({
      raceDate: "2026-06-13",
      raceName: "EcoTrail",
    });
  });
});
