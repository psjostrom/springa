import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/constants";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  return { holder: { db: null as unknown as Client } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect, the one allowed exception
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

import { encrypt } from "@/lib/credentials";
import { SCHEMA_DDL } from "@/lib/db";
import {
  applyPlannerPreview,
  buildPlannerPreview,
  getPlannerState,
} from "@/lib/plannerService";
import { canonicalPlannerConfig, type PlannerConfig } from "@/lib/plannerConfig";
import { getPlannerMetadata, savePlannerMetadata } from "@/lib/plannerMetadata";
import { getUserSettings, saveUserSettings } from "@/lib/settings";
import { server } from "./msw/server";
import { capturedDeleteEventIds, capturedPutPayload, capturedUploadPayload, resetCaptures } from "./msw/handlers";

const EMAIL = "planner-service@example.com";
const API_KEY = "intervals-key";
const NOW = new Date("2026-08-25T12:00:00+02:00");
const CONFIG: PlannerConfig = {
  raceName: "Stockholm Half",
  raceDist: 21.1,
  raceDate: "2026-11-29",
  currentAbilityDist: 10,
  currentAbilitySecs: 3600,
  runDays: [0, 2, 4],
  longRunDay: 0,
  clubDay: null,
  clubType: null,
  totalWeeks: 14,
  startKm: 8,
  includeBasePhase: true,
  effortMetric: "pace",
};

const PARSEABLE_DESCRIPTION = `Warmup
- 10m 85-94% pace intensity=warmup

Main set
- 20m 85-94% pace intensity=active

Cooldown
- 10m 85-94% pace intensity=cooldown`;

function useProvider(events: unknown[] = []) {
  server.use(
    http.get(`${API_BASE}/athlete/0`, () =>
      HttpResponse.json({
        sportSettings: [{ types: ["Run"], lthr: 160, max_hr: 190 }],
      }),
    ),
    http.get(`${API_BASE}/athlete/0/events`, () => HttpResponse.json(events)),
  );
}

async function seedSettings(overrides: Record<string, unknown> = {}) {
  await holder.db.execute({
    sql: `INSERT INTO user_settings
      (email, intervals_api_key, race_name, race_date, race_dist, total_weeks, start_km,
       current_ability_dist, current_ability_secs, run_days, long_run_day, include_base_phase,
       effort_metric, timezone, diabetes_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      EMAIL,
      encrypt(API_KEY, process.env.CREDENTIALS_ENCRYPTION_KEY!),
      CONFIG.raceName,
      CONFIG.raceDate,
      CONFIG.raceDist,
      CONFIG.totalWeeks,
      CONFIG.startKm,
      CONFIG.currentAbilityDist,
      CONFIG.currentAbilitySecs,
      JSON.stringify(CONFIG.runDays),
      CONFIG.longRunDay,
      CONFIG.includeBasePhase ? 1 : 0,
      CONFIG.effortMetric,
      "Europe/Stockholm",
      0,
    ],
  });
  for (const [key, value] of Object.entries(overrides)) {
    await holder.db.execute({
      sql: `UPDATE user_settings SET ${key} = ? WHERE email = ?`,
      args: [
        (typeof value === "boolean" ? (value ? 1 : 0) : value) as string | number | null,
        EMAIL,
      ],
    });
  }
}

beforeAll(async () => {
  await holder.db.executeMultiple(SCHEMA_DDL);
});

beforeEach(async () => {
  await holder.db.execute("DELETE FROM user_settings");
  await holder.db.execute("DELETE FROM activity_streams");
  resetCaptures();
  useProvider();
});

describe("Planner service", () => {
  it("reports active synced state from owned future workouts", async () => {
    await seedSettings();
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: canonicalPlannerConfig(CONFIG),
      dirty: false,
    });
    useProvider([
      { id: 101, category: "WORKOUT", type: "Run", start_date_local: "2026-09-01T12:00:00", external_id: "easy-2026-11-29-1-0", paired_activity_id: null },
      { id: 102, category: "WORKOUT", type: "Run", start_date_local: "2026-09-02T12:00:00", external_id: "long-2026-11-29-1", paired_activity_id: null },
      { id: 103, category: "WORKOUT", type: "Run", start_date_local: "2026-09-03T12:00:00", external_id: "speed-2026-11-29-1", paired_activity_id: null },
      { id: 104, category: "WORKOUT", type: "Run", start_date_local: "2026-09-04T12:00:00", external_id: "manual-1", paired_activity_id: null },
    ]);

    const state = await getPlannerState(EMAIL, NOW);

    expect(state.plan).toMatchObject({
      status: "active",
      sync: { status: "synced", dirtyKind: null },
      futureWorkoutCount: 3,
    });
  });

  it("returns no countdown for a completed plan without future workouts", async () => {
    await seedSettings();
    await saveUserSettings(EMAIL, { raceDate: "2026-08-01" });

    const state = await getPlannerState(EMAIL, NOW);

    expect(state.plan).toMatchObject({
      status: "complete",
      weeksToGo: null,
      futureWorkoutCount: 0,
    });
  });

  it("builds a replace preview without provider or metadata writes", async () => {
    await seedSettings();
    const before = await getPlannerMetadata(EMAIL);
    useProvider([
      { id: 201, category: "WORKOUT", type: "Run", start_date_local: "2026-09-01T12:00:00", external_id: "easy-2026-11-29-old", paired_activity_id: null },
    ]);

    const preview = await buildPlannerPreview(
      EMAIL,
      { intent: "start", config: CONFIG },
      NOW,
    );

    expect(preview.response.action).toBe("replace-plan");
    expect(preview.response.workouts.length).toBeGreaterThan(0);
    expect(preview.response.previewHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await getPlannerMetadata(EMAIL)).toEqual(before);
    expect(capturedUploadPayload).toEqual([]);
    expect(capturedDeleteEventIds).toEqual([]);
  });

  it("rejects a stale preview before any apply write", async () => {
    await seedSettings();
    useProvider([
      { id: 201, category: "WORKOUT", type: "Run", start_date_local: "2026-09-01T12:00:00", external_id: "easy-2026-11-29-old", paired_activity_id: null },
    ]);
    const preview = await buildPlannerPreview(
      EMAIL,
      { intent: "start", config: CONFIG },
      NOW,
    );

    useProvider([
      { id: 201, category: "WORKOUT", type: "Run", start_date_local: "2026-09-01T12:00:00", external_id: "easy-2026-11-29-old", paired_activity_id: null },
      { id: 202, category: "WORKOUT", type: "Run", start_date_local: "2026-09-02T12:00:00", external_id: "long-2026-11-29-extra", paired_activity_id: null },
    ]);

    await expect(
      applyPlannerPreview(
        EMAIL,
        { intent: "start", config: CONFIG, previewHash: preview.response.previewHash },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "PLAN_PREVIEW_STALE" });
    expect(capturedUploadPayload).toEqual([]);
    expect(capturedDeleteEventIds).toEqual([]);
  });

  it("applies a replace preview and removes only stale owned workouts", async () => {
    await seedSettings();
    useProvider([
      { id: 201, category: "WORKOUT", type: "Run", start_date_local: "2026-09-01T12:00:00", external_id: "easy-2026-11-29-old", paired_activity_id: null },
      { id: 202, category: "WORKOUT", type: "Run", start_date_local: "2026-09-02T12:00:00", external_id: "manual-event", paired_activity_id: null },
      { id: 203, category: "WORKOUT", type: "Run", start_date_local: "2026-09-03T12:00:00", external_id: "easy-2026-11-29-paired", paired_activity_id: "activity-203" },
    ]);
    const preview = await buildPlannerPreview(
      EMAIL,
      { intent: "start", config: CONFIG },
      NOW,
    );

    const result = await applyPlannerPreview(
      EMAIL,
      { intent: "start", config: CONFIG, previewHash: preview.response.previewHash },
      NOW,
    );

    expect(result).toMatchObject({ action: "replace-plan", appliedWorkoutCount: preview.response.workouts.length });
    expect(capturedUploadPayload.length).toBe(preview.response.workouts.length);
    expect(capturedDeleteEventIds).toEqual(["201"]);
    expect(await getPlannerMetadata(EMAIL)).toEqual({
      generatedPlanConfig: canonicalPlannerConfig(CONFIG),
      dirty: false,
    });
  });

  it("restores an empty Planner state after the first-program upload fails", async () => {
    await seedSettings();
    await holder.db.execute({
      sql: `UPDATE user_settings SET
        race_name = NULL, race_date = NULL, race_dist = NULL, total_weeks = NULL,
        start_km = NULL, current_ability_dist = NULL, current_ability_secs = NULL,
        run_days = NULL, long_run_day = NULL, club_day = NULL, club_type = NULL,
        include_base_phase = NULL, effort_metric = NULL,
        generated_plan_config = NULL, planner_config_dirty = 0
        WHERE email = ?`,
      args: [EMAIL],
    });
    server.use(
      http.post(`${API_BASE}/athlete/0/events/bulk`, () =>
        new HttpResponse(null, { status: 502 })),
    );

    const preview = await buildPlannerPreview(EMAIL, { intent: "start", config: CONFIG }, NOW);
    await expect(
      applyPlannerPreview(
        EMAIL,
        { intent: "start", config: CONFIG, previewHash: preview.response.previewHash },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "INTERVALS_UPSTREAM_ERROR" });

    const row = await holder.db.execute({
      sql: `SELECT race_name, race_date, race_dist, total_weeks, start_km,
        current_ability_dist, current_ability_secs, run_days, long_run_day,
        club_day, club_type, include_base_phase, effort_metric,
        generated_plan_config, planner_config_dirty
        FROM user_settings WHERE email = ?`,
      args: [EMAIL],
    });
    expect(row.rows[0]).toMatchObject({
      race_name: null,
      race_date: null,
      race_dist: null,
      total_weeks: null,
      start_km: null,
      current_ability_dist: null,
      current_ability_secs: null,
      run_days: null,
      long_run_day: null,
      club_day: null,
      club_type: null,
      include_base_phase: null,
      effort_metric: null,
      generated_plan_config: null,
      planner_config_dirty: 0,
    });
  });

  it("restores the exact previous Planner state after a replacement upload fails", async () => {
    await seedSettings();
    const previousConfig: PlannerConfig = {
      ...CONFIG,
      raceName: "Previous race",
      currentAbilitySecs: 3300,
      runDays: [1, 3, 6],
      longRunDay: 6,
      clubDay: 1,
      clubType: "speed",
      startKm: 7,
      includeBasePhase: false,
    };
    await saveUserSettings(EMAIL, {
      ...previousConfig,
      warmthPreference: -2,
      displayName: "Runner",
    });
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: "previous-generated-config",
      dirty: true,
    });
    const before = await getUserSettings(EMAIL);
    const beforeMetadata = await getPlannerMetadata(EMAIL);
    server.use(
      http.post(`${API_BASE}/athlete/0/events/bulk`, () =>
        new HttpResponse(null, { status: 502 })),
    );

    const preview = await buildPlannerPreview(EMAIL, { intent: "start", config: CONFIG }, NOW);
    await expect(
      applyPlannerPreview(
        EMAIL,
        { intent: "start", config: CONFIG, previewHash: preview.response.previewHash },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "INTERVALS_UPSTREAM_ERROR" });

    const after = await getUserSettings(EMAIL);
    expect(after).toMatchObject({
      raceDate: before.raceDate,
      raceName: before.raceName,
      raceDist: before.raceDist,
      currentAbilitySecs: before.currentAbilitySecs,
      currentAbilityDist: before.currentAbilityDist,
      totalWeeks: before.totalWeeks,
      startKm: before.startKm,
      includeBasePhase: before.includeBasePhase,
      effortMetric: before.effortMetric,
      runDays: before.runDays,
      longRunDay: before.longRunDay,
      clubDay: before.clubDay,
      clubType: before.clubType,
      warmthPreference: before.warmthPreference,
      displayName: before.displayName,
    });
    expect(after).toMatchObject({
      raceDate: previousConfig.raceDate,
      raceName: previousConfig.raceName,
      currentAbilitySecs: previousConfig.currentAbilitySecs,
      runDays: previousConfig.runDays,
    });
    expect(await getPlannerMetadata(EMAIL)).toEqual(beforeMetadata);
  });

  it("applies target-only updates in place without structural writes", async () => {
    await seedSettings();
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: canonicalPlannerConfig(CONFIG),
      dirty: false,
    });
    useProvider([
      { id: 301, category: "WORKOUT", type: "Run", start_date_local: "2026-09-01T12:00:00", external_id: "easy-2026-11-29-1-0", name: "W01 Easy", description: PARSEABLE_DESCRIPTION, paired_activity_id: null },
      { id: 302, category: "WORKOUT", type: "Run", start_date_local: "2026-09-02T12:00:00", external_id: "long-2026-11-29-1", name: "W01 Long (10km)", description: PARSEABLE_DESCRIPTION, paired_activity_id: null },
    ]);
    const config = { ...CONFIG, currentAbilitySecs: 3500 };
    const preview = await buildPlannerPreview(
      EMAIL,
      { intent: "update", config },
      NOW,
    );
    expect(preview.response.action).toBe("update-targets");

    const result = await applyPlannerPreview(
      EMAIL,
      { intent: "update", config, previewHash: preview.response.previewHash },
      NOW,
    );

    expect(result).toMatchObject({ action: "update-targets", appliedWorkoutCount: 2 });
    expect(capturedUploadPayload).toEqual([]);
    expect(capturedDeleteEventIds).toEqual([]);
    expect(capturedPutPayload?.body).not.toHaveProperty("start_date_local");
    expect(capturedPutPayload?.body).not.toHaveProperty("external_id");
    expect(await getPlannerMetadata(EMAIL)).toEqual({
      generatedPlanConfig: canonicalPlannerConfig(config),
      dirty: false,
    });
  });

  it("rejects target previews when a provider workout date changes", async () => {
    await seedSettings();
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: canonicalPlannerConfig(CONFIG),
      dirty: false,
    });
    useProvider([
      { id: 351, category: "WORKOUT", type: "Run", start_date_local: "2026-09-01T12:00:00", external_id: "easy-2026-11-29-1-0", name: "W01 Easy", description: PARSEABLE_DESCRIPTION, paired_activity_id: null },
      { id: 352, category: "WORKOUT", type: "Run", start_date_local: "2026-09-02T12:00:00", external_id: "long-2026-11-29-1", name: "W01 Long (10km)", description: PARSEABLE_DESCRIPTION, paired_activity_id: null },
    ]);
    const config = { ...CONFIG, currentAbilitySecs: 3500 };
    const preview = await buildPlannerPreview(EMAIL, { intent: "update", config }, NOW);

    useProvider([
      { id: 351, category: "WORKOUT", type: "Run", start_date_local: "2026-09-03T12:00:00", external_id: "easy-2026-11-29-1-0", name: "W01 Easy", description: PARSEABLE_DESCRIPTION, paired_activity_id: null },
      { id: 352, category: "WORKOUT", type: "Run", start_date_local: "2026-09-02T12:00:00", external_id: "long-2026-11-29-1", name: "W01 Long (10km)", description: PARSEABLE_DESCRIPTION, paired_activity_id: null },
    ]);

    await expect(
      applyPlannerPreview(
        EMAIL,
        { intent: "update", config, previewHash: preview.response.previewHash },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "PLAN_PREVIEW_STALE" });
    expect(capturedPutPayload).toBeNull();
  });

  it("keeps target metadata dirty when one update fails", async () => {
    await seedSettings();
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: canonicalPlannerConfig(CONFIG),
      dirty: false,
    });
    useProvider([
      { id: 401, category: "WORKOUT", type: "Run", start_date_local: "2026-09-01T12:00:00", external_id: "easy-2026-11-29-1-0", name: "W01 Easy", description: PARSEABLE_DESCRIPTION, paired_activity_id: null },
      { id: 402, category: "WORKOUT", type: "Run", start_date_local: "2026-09-02T12:00:00", external_id: "long-2026-11-29-1", name: "W01 Long (10km)", description: PARSEABLE_DESCRIPTION, paired_activity_id: null },
    ]);
    server.use(
      http.put(`${API_BASE}/athlete/0/events/402`, () =>
        HttpResponse.json({ error: "upstream 502" }, { status: 502 })),
    );
    const config = { ...CONFIG, currentAbilitySecs: 3500 };
    const preview = await buildPlannerPreview(EMAIL, { intent: "update", config }, NOW);

    await expect(
      applyPlannerPreview(
        EMAIL,
        { intent: "update", config, previewHash: preview.response.previewHash },
        NOW,
      ),
    ).rejects.toMatchObject({
      code: "PLANNER_APPLY_PARTIAL",
      details: { appliedWorkoutCount: 1 },
    });
    expect((await getPlannerMetadata(EMAIL)).dirty).toBe(true);
  });
});
