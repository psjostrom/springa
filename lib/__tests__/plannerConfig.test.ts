import { describe, expect, it } from "vitest";
import {
  FITNESS_DISTANCES,
  PLANNER_CONFIG_VERSION,
  buildPlannerDefaults,
  canonicalPlannerConfig,
  classifyPlannerDirty,
  maxGeneratedPlanWeek,
  normalizePlannerConfig,
  parsePlannerApplyRequest,
  parsePlannerPreviewRequest,
  resolvePlannerConfig,
  summarizePreview,
  validatePlannerConfig,
  type PlannerConfig,
} from "../plannerConfig";

const NOW = new Date("2026-08-25T12:00:00+02:00");
const VALID: PlannerConfig = {
  raceName: "Stockholm Half",
  raceDist: 21.1,
  raceDate: "2026-11-29",
  currentAbilityDist: 10,
  currentAbilitySecs: 3600,
  runDays: [2, 4, 0],
  longRunDay: 0,
  clubDay: 4,
  clubType: "speed",
  totalWeeks: 14,
  startKm: 8,
  includeBasePhase: true,
  effortMetric: "pace",
};

describe("Planner config contracts", () => {
  it.each([
    ["raceDist", 0.9],
    ["raceDist", 100.1],
    ["startKm", 1.9],
    ["startKm", 42.1],
    ["totalWeeks", 7],
    ["currentAbilitySecs", 0],
  ])("rejects %s=%s", (field, value) => {
    const result = validatePlannerConfig(
      { ...VALID, [field]: value },
      NOW,
      "Europe/Stockholm",
    );
    expect(result.fields).toHaveProperty(field === "totalWeeks" ? "totalWeeks" : field);
  });

  it("rejects malformed request shapes and unknown keys", () => {
    expect(() => parsePlannerPreviewRequest(null)).toThrow(
      "Planner request must be an object",
    );
    expect(() => parsePlannerPreviewRequest({ intent: "start" })).toThrow();
    expect(() =>
      parsePlannerPreviewRequest({
        intent: "start",
        config: { ...VALID, unknown: true },
      }),
    ).toThrow();
  });

  it("rejects invalid dates, weekdays, duplicate days, and schedule collisions", () => {
    expect(validatePlannerConfig({ ...VALID, raceDate: "2026-02-31" }, NOW, "Europe/Stockholm").fields)
      .toHaveProperty("raceDate");
    expect(validatePlannerConfig({ ...VALID, runDays: [2, 2] }, NOW, "Europe/Stockholm").fields)
      .toHaveProperty("runDays");
    expect(validatePlannerConfig({ ...VALID, runDays: [2], longRunDay: 2 }, NOW, "Europe/Stockholm").fields)
      .toHaveProperty("runDays");
    expect(validatePlannerConfig({ ...VALID, longRunDay: 1 }, NOW, "Europe/Stockholm").fields)
      .toHaveProperty("longRunDay");
    expect(validatePlannerConfig({ ...VALID, clubDay: 0, clubType: "speed" }, NOW, "Europe/Stockholm").fields)
      .toHaveProperty("clubDay");
    expect(validatePlannerConfig({ ...VALID, clubDay: null, clubType: "speed" }, NOW, "Europe/Stockholm").fields)
      .toHaveProperty("clubType");
  });

  it("rejects race dates below the minimum horizon before clamping", () => {
    for (const raceDate of ["2026-08-24", "2026-08-26", "2026-10-06"]) {
      expect(
        validatePlannerConfig(
          { ...VALID, raceDate, totalWeeks: 8 },
          NOW,
          "Europe/Stockholm",
        ).fields,
      ).toHaveProperty("totalWeeks");
    }

    expect(
      validatePlannerConfig(
        { ...VALID, raceDate: "2026-10-13", totalWeeks: 8 },
        NOW,
        "Europe/Stockholm",
      ).fields,
    ).not.toHaveProperty("totalWeeks");
    expect(
      validatePlannerConfig(VALID, NOW, "Europe/Stockholm").fields,
    ).not.toHaveProperty("totalWeeks");
  });

  it("requires HR context for heart-rate prescriptions", () => {
    const result = validatePlannerConfig(
      { ...VALID, effortMetric: "hr" },
      NOW,
      "Europe/Stockholm",
      { lthr: 160, hrZones: [100, 120, 140, 160] },
    );
    expect(result.fields).toHaveProperty("effortMetric");
  });

  it("normalizes dates, days, base phase, and total weeks", () => {
    const normalized = normalizePlannerConfig(
      {
        ...VALID,
        raceName: "  Stockholm Half ",
        runDays: [0, 4, 2, 4],
        totalWeeks: 1,
        includeBasePhase: true,
      },
      NOW,
      "Europe/Stockholm",
    );
    expect(normalized.raceName).toBe("Stockholm Half");
    expect(normalized.runDays).toEqual([0, 2, 4]);
    expect(normalized.totalWeeks).toBe(14);
    expect(normalized.includeBasePhase).toBe(true);

    expect(
      normalizePlannerConfig(
        { ...VALID, raceDate: "2026-10-04", includeBasePhase: true },
        NOW,
        "Europe/Stockholm",
      ).includeBasePhase,
    ).toBe(false);
  });

  it("canonicalizes generation fields without race name", () => {
    const canonical = canonicalPlannerConfig(VALID);
    expect(JSON.parse(canonical)).toEqual({
      version: PLANNER_CONFIG_VERSION,
      raceDist: 21.1,
      raceDate: "2026-11-29",
      currentAbilityDist: 10,
      currentAbilitySecs: 3600,
      runDays: [0, 2, 4],
      longRunDay: 0,
      clubDay: 4,
      clubType: "speed",
      totalWeeks: 14,
      startKm: 8,
      includeBasePhase: true,
      effortMetric: "pace",
    });
    expect(canonicalPlannerConfig({ ...VALID, raceName: "Other" })).toBe(canonical);
  });

  it("classifies target-only and structural changes", () => {
    const baseline = canonicalPlannerConfig(VALID);
    expect(
      classifyPlannerDirty(canonicalPlannerConfig({ ...VALID, effortMetric: "feel" }), baseline),
    ).toBe("target-only");
    expect(
      classifyPlannerDirty(canonicalPlannerConfig({ ...VALID, runDays: [2, 4, 6, 0] }), baseline),
    ).toBe("structural");
    expect(
      classifyPlannerDirty(canonicalPlannerConfig({ ...VALID, effortMetric: "feel", runDays: [2, 4, 6, 0] }), baseline),
    ).toBe("structural");
    expect(classifyPlannerDirty(null, baseline)).toBe("structural");
  });

  it("parses complete preview and apply requests", () => {
    expect(parsePlannerPreviewRequest({ intent: "start", config: VALID })).toEqual({
      intent: "start",
      config: VALID,
    });
    expect(
      parsePlannerApplyRequest({
        intent: "update",
        config: VALID,
        previewHash: "a".repeat(64),
      }).previewHash,
    ).toBe("a".repeat(64));
  });

  it("exposes supported fitness distances for defaults", () => {
    expect(FITNESS_DISTANCES).toEqual([5, 10, 21.1, 42.2]);
    expect(buildPlannerDefaults({}, NOW).raceDate).toBe("2026-12-29");
  });

  it("keeps default plan length aligned with its race date", () => {
    const defaults = buildPlannerDefaults({}, NOW);

    expect(defaults.totalWeeks).toBe(19);
    expect(validatePlannerConfig(defaults, NOW, "Europe/Stockholm").fields)
      .not.toHaveProperty("totalWeeks");
  });

  it("resolves update timelines from the exact generated-plan anchor", () => {
    const anchor: PlannerConfig = {
      ...VALID,
      raceDate: "2026-10-18",
      totalWeeks: 14,
    };

    const sameRace = resolvePlannerConfig(
      { ...anchor, totalWeeks: 8 },
      "update",
      canonicalPlannerConfig(anchor),
      NOW,
      "Europe/Stockholm",
    );
    expect(sameRace.anchored).toBe(true);
    expect(sameRace.config.totalWeeks).toBe(14);

    const changedRace = resolvePlannerConfig(
      { ...anchor, raceDate: "2026-09-20", totalWeeks: 8 },
      "update",
      canonicalPlannerConfig(anchor),
      NOW,
      "Europe/Stockholm",
    );
    expect(changedRace.anchored).toBe(true);
    expect(changedRace.config.totalWeeks).toBe(10);
    expect(summarizePreview(changedRace.config, [{
      key: "easy-2026-09-20-7-0",
      week: 7,
      date: "2026-08-24",
      name: "W07 Easy",
      category: "easy",
      distanceKm: 6,
      durationMinutes: 36,
      fuelRateGPerHour: null,
    }]).weeks[0]?.startsOn).toBe("2026-08-24");
  });

  it("does not guess an update anchor from missing or malformed metadata", () => {
    for (const generatedPlanConfig of [null, "", "not-json", '{"version":4}']) {
      const resolved = resolvePlannerConfig(
        { ...VALID, raceDate: "2026-09-20", totalWeeks: 8 },
        "update",
        generatedPlanConfig,
        NOW,
        "Europe/Stockholm",
      );
      expect(resolved.anchored).toBe(false);
      expect(resolved.config.totalWeeks).toBe(8);
    }
  });

  it("does not anchor semantically invalid generated metadata", () => {
    const invalidAnchor = canonicalPlannerConfig({
      ...VALID,
      raceDate: "2026-10-18",
      totalWeeks: 14,
      raceDist: 0,
    });

    const resolved = resolvePlannerConfig(
      { ...VALID, raceDate: "2026-09-20", totalWeeks: 8 },
      "update",
      invalidAnchor,
      NOW,
      "Europe/Stockholm",
    );

    expect(resolved.anchored).toBe(false);
    expect(resolved.config.totalWeeks).toBe(8);
  });

  it("finds the highest week only in exact generated IDs for the requested race", () => {
    expect(maxGeneratedPlanWeek([
      "easy-2026-10-18-7-2",
      "free-2026-10-18-8-4",
      "long-2026-10-18-9",
      "speed-2026-10-18-10",
      "club-2026-10-18-14",
      "race-2026-10-18",
      "easy-2026-09-20-99-2",
      "long-2026-10-18-14-extra",
      "long-2026-10-18-0",
      "easy-2026-10-18-15-7",
      "manual-2026-10-18-99",
      undefined,
    ], "2026-10-18")).toBe(14);
    expect(maxGeneratedPlanWeek(["race-2026-10-18"], "2026-10-18")).toBeNull();
  });

  it("omits only leading empty weeks from preview summaries", () => {
    const summary = summarizePreview(
      { ...VALID, totalWeeks: 14 },
      [
        {
          key: "easy-2026-11-29-7-0",
          week: 7,
          date: "2026-10-12",
          name: "W07 Easy",
          category: "easy",
          distanceKm: 6,
          durationMinutes: 36,
          fuelRateGPerHour: null,
        },
        {
          key: "long-2026-11-29-9",
          week: 9,
          date: "2026-10-26",
          name: "W09 Long (12km)",
          category: "long",
          distanceKm: 12,
          durationMinutes: 72,
          fuelRateGPerHour: null,
        },
      ],
    );

    expect(summary.summary.planWeeks).toBe(14);
    expect(summary.weeks.map((week) => week.week)).toEqual([7, 8, 9, 10, 11, 12, 13, 14]);
    expect(summary.weeks[1]).toMatchObject({ week: 8, workoutCount: 0, distanceKm: 0 });
  });

  it("returns no week rows when preview has no workouts", () => {
    expect(summarizePreview({ ...VALID, totalWeeks: 14 }, []).weeks).toEqual([]);
  });
});
