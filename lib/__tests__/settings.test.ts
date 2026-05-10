import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { Client } from "@libsql/client";

// vi.hoisted runs before vi.mock hoisting — safe to create the shared db here
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
import { getUserSettings, saveUserSettings, WRITABLE_SETTINGS_KEYS } from "../settings";
import type { UserSettings } from "../settings";

const testDb = () => holder.db;

// Multi-user defaults returned for any existing row
const MULTI_USER_DEFAULTS = {
  diabetesMode: false,
  timezone: "Europe/Stockholm",
  onboardingComplete: false,
  nightscoutConnected: false,
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

  it("persists currentAbilitySecs and currentAbilityDist (roundtrip test)", async () => {
    await saveUserSettings("user@example.com", {
      currentAbilitySecs: 3300,
      currentAbilityDist: 10,
    });

    const result = await getUserSettings("user@example.com");
    expect(result.currentAbilitySecs).toBe(3300);
    expect(result.currentAbilityDist).toBe(10);
  });

  it("every WRITABLE_SETTINGS_KEYS field roundtrips through save/load", async () => {
    const testValues: Record<string, unknown> = {
      raceDate: "2030-01-01",
      raceName: "Test Race",
      raceDist: 42,
      currentAbilitySecs: 1800,
      currentAbilityDist: 5,
      totalWeeks: 12,
      startKm: 10,
      widgetOrder: ["a", "b"],
      hiddenWidgets: ["c"],
      bgChartWindow: 120,
      includeBasePhase: true,
      warmthPreference: -1,
      diabetesMode: true,
      displayName: "Test User",
      runDays: [1, 3, 5],
      longRunDay: 0,
      clubDay: 3,
      clubType: "speed",
      onboardingComplete: true,
      insulinType: "fiasp",
      paceSuggestionDismissedAt: 1700000000000,
      dob: "1990-01-01",
      weightKg: 75,
      heightCm: 180,
      t1dSinceYear: 2010,
      pumpModel: "Omnipod",
      cgmModel: "Libre 3",
      loopSystem: "Loop",
      pumpDuringRuns: "on",
    };

    for (const key of WRITABLE_SETTINGS_KEYS) {
      const email = `roundtrip-${key}@test.com`;
      await saveUserSettings(email, { [key]: testValues[key] } as Partial<UserSettings>);
      const result = await getUserSettings(email);
      expect(
        result[key as keyof UserSettings],
        `"${key}" not handled by saveUserSettings — add it there and to WRITABLE_SETTINGS_KEYS`,
      ).toBeDefined();
    }
  });
});

describe("UserSettings profile fields", () => {
  it("round-trips dob, weight, height, t1d-since, equipment, pump-during-runs", async () => {
    await saveUserSettings("test-profile@example.com", {
      dob: "1985-06-12",
      weightKg: 80,
      heightCm: 185,
      t1dSinceYear: 2009,
      pumpModel: "Ypsomed",
      cgmModel: "Dexcom G7",
      loopSystem: "CamAPS FX",
      pumpDuringRuns: "off",
    });
    const result = await getUserSettings("test-profile@example.com");
    expect(result.dob).toBe("1985-06-12");
    expect(result.weightKg).toBe(80);
    expect(result.heightCm).toBe(185);
    expect(result.t1dSinceYear).toBe(2009);
    expect(result.pumpModel).toBe("Ypsomed");
    expect(result.cgmModel).toBe("Dexcom G7");
    expect(result.loopSystem).toBe("CamAPS FX");
    expect(result.pumpDuringRuns).toBe("off");
  });
});
