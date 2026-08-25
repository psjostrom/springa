import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/constants";

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

import { SCHEMA_DDL } from "@/lib/db";
import {
  resolveHeartRateZones,
  resolvePlanContext,
} from "@/lib/planContext";
import { server } from "./msw/server";
import type { PlannerConfig } from "@/lib/plannerConfig";

const EMAIL = "planner@example.com";
const API_KEY = "intervals-key";
const PROFILE = {
  sportSettings: [
    {
      types: ["Run"],
      lthr: 160,
      max_hr: 190,
      hr_zones: [120, 140, 160, 175, 190],
    },
  ],
};
const OVERRIDE: PlannerConfig = {
  raceName: "New Race",
  raceDist: 42.2,
  raceDate: "2027-01-03",
  currentAbilityDist: 10,
  currentAbilitySecs: 3300,
  runDays: [0, 2, 4],
  longRunDay: 0,
  clubDay: null,
  clubType: null,
  totalWeeks: 18,
  startKm: 10,
  includeBasePhase: true,
  effortMetric: "pace",
};

beforeAll(async () => {
  await holder.db.executeMultiple(SCHEMA_DDL);
});

beforeEach(async () => {
  await holder.db.execute("DELETE FROM user_settings");
  await holder.db.execute("DELETE FROM activity_streams");
  server.use(
    http.get(`${API_BASE}/athlete/0`, () => HttpResponse.json(PROFILE)),
  );
});

describe("Planner plan context", () => {
  it("resolves stored settings and profile-owned HR context", async () => {
    await holder.db.execute({
      sql: `INSERT INTO user_settings
        (email, race_date, race_dist, total_weeks, start_km, current_ability_dist, current_ability_secs,
         timezone, effort_metric)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [EMAIL, "2026-11-29", 21.1, 14, 8, 10, 3600, "Europe/Stockholm", "pace"],
    });

    const resolved = await resolvePlanContext(EMAIL, API_KEY);

    expect(resolved.timezone).toBe("Europe/Stockholm");
    expect(resolved.planConfig).toMatchObject({
      raceDateStr: "2026-11-29",
      raceDist: 21.1,
      startKm: 8,
      currentAbilityDist: 10,
      currentAbilitySecs: 3600,
      lthr: 160,
      hrZones: [112, 148, 165, 184, 190],
    });
    expect(resolved.estimationContext.thresholdPace).toBeTypeOf("number");
  });

  it("uses validated Planner override and builds diabetes model from cached streams", async () => {
    await holder.db.execute({
      sql: `INSERT INTO user_settings
        (email, race_date, race_dist, total_weeks, start_km, current_ability_dist, current_ability_secs,
         timezone, diabetes_mode, effort_metric)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [EMAIL, "2026-11-29", 21.1, 14, 8, 10, 3600, "Europe/Stockholm", 1, "pace"],
    });
    await holder.db.execute({
      sql: `INSERT INTO activity_streams (email, activity_id, name, hr, activity_date)
        VALUES (?, ?, ?, ?, ?)`,
      args: [EMAIL, "activity-1", "W01 Easy", JSON.stringify([]), "2026-07-01"],
    });

    const resolved = await resolvePlanContext(EMAIL, API_KEY, OVERRIDE);

    expect(resolved.planConfig).toMatchObject({
      raceDateStr: OVERRIDE.raceDate,
      raceDist: OVERRIDE.raceDist,
      startKm: OVERRIDE.startKm,
      currentAbilityDist: OVERRIDE.currentAbilityDist,
      currentAbilitySecs: OVERRIDE.currentAbilitySecs,
      effortMetric: OVERRIDE.effortMetric,
    });
    expect(resolved.bgModel).not.toBeNull();
  });

  it("prefers stored zones, then profile zones, then max-HR fallback", () => {
    expect(
      resolveHeartRateZones(
        { hrZones: [1, 2, 3, 4, 5], maxHr: 180 },
        { hrZones: [6, 7, 8, 9, 10], maxHr: 190 },
      ),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(
      resolveHeartRateZones(
        { maxHr: 180 },
        { hrZones: [6, 7, 8, 9, 10], maxHr: 190 },
      ),
    ).toEqual([6, 7, 8, 9, 10]);
    expect(
      resolveHeartRateZones({ maxHr: 180 }, {}, 200),
    ).toEqual(expect.any(Array));
  });
});
