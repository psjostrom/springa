import { describe, it, expect } from "vitest";
import {
  buildIntelScreenData,
  buildHistoryData,
  buildTomorrowData,
} from "../intelScreenData";
import type { CachedActivity } from "../activityStreamsDb";
import type { CalendarEvent } from "../types";
import type { UserSettings } from "../settings";

function makeActivity(overrides: Partial<CachedActivity> & { activityId: string }): CachedActivity {
  return {
    activityId: overrides.activityId,
    name: overrides.name ?? "Easy run",
    category: overrides.category ?? "easy",
    fuelRate: overrides.fuelRate ?? 60,
    hr: overrides.hr ?? [],
    runBGContext: overrides.runBGContext ?? null,
    pace: overrides.pace ?? [],
    cadence: overrides.cadence ?? [],
    altitude: overrides.altitude ?? [],
    activityDate: overrides.activityDate ?? "2026-04-01",
    runStartMs: overrides.runStartMs ?? new Date("2026-04-01T07:00:00Z").getTime(),
    glucose: overrides.glucose,
    distance: overrides.distance,
    rawTime: overrides.rawTime,
  };
}

describe("buildIntelScreenData", () => {
  it("returns shape with all four sections present", () => {
    // glucose `time` is in MINUTES — 0, 30, 60 = a one-hour run.
    const activities: CachedActivity[] = [
      makeActivity({
        activityId: "a1",
        category: "easy",
        glucose: [
          { time: 0, value: 8.0 },
          { time: 30, value: 6.5 },
          { time: 60, value: 5.2 },
        ],
        runBGContext: {
          activityId: "a1",
          category: "easy",
          pre: { startBG: 8.0, entrySlope30m: 0.0, entryStability: 0.5, readingCount: 6 },
          post: {
            endBG: 5.2,
            recoveryDrop30m: 0.3,
            nadirPostRun: 4.8,
            timeToStable: 30,
            postRunHypo: false,
            readingCount: 12,
            peak30m: 6.0,
            spike30m: 0.8,
            peak60mAboveEnd: 1.5,
          },
          totalBGImpact: -2.0,
        },
      }),
      makeActivity({
        activityId: "a2",
        category: "long",
        glucose: [
          { time: 0, value: 10.0 },
          { time: 30, value: 7.0 },
          { time: 60, value: 3.8 },
        ],
        runBGContext: {
          activityId: "a2",
          category: "long",
          pre: { startBG: 10.0, entrySlope30m: -0.05, entryStability: 0.5, readingCount: 6 },
          post: {
            endBG: 3.8,
            recoveryDrop30m: -0.5,
            nadirPostRun: 3.5,
            timeToStable: null,
            postRunHypo: true,
            readingCount: 12,
            peak30m: 4.5,
            spike30m: 0.7,
            peak60mAboveEnd: 3.2,
          },
          totalBGImpact: -5.5,
        },
      }),
    ];
    const events: CalendarEvent[] = [
      {
        id: "e1",
        activityId: "a1",
        date: new Date("2026-04-01T07:00:00Z"),
        name: "W01 Easy",
        description: "",
        type: "completed",
        category: "easy",
        distance: 5000,
        duration: 1800,
      },
      {
        id: "e2",
        activityId: "a2",
        date: new Date("2026-04-04T08:00:00Z"),
        name: "W01 Long (10km)",
        description: "",
        type: "completed",
        category: "long",
        distance: 10000,
        duration: 3600,
      },
      {
        id: "e3",
        date: new Date("2026-04-08T07:00:00Z"),
        name: "W02 Easy",
        description: "",
        type: "planned",
        category: "easy",
        distance: 6000,
        duration: 2100,
      },
    ];
    const settings: UserSettings = {
      raceDate: "2026-06-13",
      raceName: "EcoTrail",
      raceDist: 16,
      hrZones: [120, 140, 160, 175, 190],
    };

    const result = buildIntelScreenData(activities, events, settings, 7.5, new Date("2026-04-07T12:00:00Z"));

    // duringStats
    expect(result.duringStats.easy).not.toBeNull();
    expect(result.duringStats.easy?.runCount).toBe(1);
    expect(result.duringStats.easy?.medianEndBG).toBeCloseTo(5.2, 1);
    // (8.0 - 5.2) over 1 hour = 2.8 mmol/L per hour. Locks in the units fix
    // (was previously 60x too large because we divided by 3600 instead of 60).
    expect(result.duringStats.easy?.avgDropPerHr).toBeCloseTo(2.8, 1);
    expect(result.duringStats.long).not.toBeNull();
    expect(result.duringStats.long?.hypoCount).toBe(1); // 3.8 < 4.0
    expect(result.duringStats.long?.avgDropPerHr).toBeCloseTo(6.2, 1);
    expect(result.duringStats.interval).toBeNull();

    // afterStats
    expect(result.afterStats.easy?.runCount).toBe(1);
    expect(result.afterStats.easy?.bigReboundCount).toBe(0); // 1.5 not > 2.0
    expect(result.afterStats.long?.bigReboundCount).toBe(1); // 3.2 > 2.0
    expect(result.afterStats.long?.lateHypoCount).toBe(1);

    // distance
    expect(result.distance.longestRun?.distanceKm).toBe(10);
    expect(result.distance.race).toEqual({
      name: "EcoTrail",
      distanceKm: 16,
      date: "2026-06-13",
    });

    // tomorrow
    expect(result.tomorrow).not.toBeNull();
    expect(result.tomorrow?.workout.name).toBe("W02 Easy");
    expect(result.tomorrow?.workout.category).toBe("easy");
    expect(result.tomorrow?.workout.distanceKm).toBe(6);
    expect(result.tomorrow?.workout.targetHRRange).toContain("Z2");
    expect(result.tomorrow?.currentBG).toBe(7.5);
    expect(result.tomorrow?.currentBGSource).toBe("live");
    // matches array exists (may be empty when no soft predictors hit)
    expect(Array.isArray(result.tomorrow?.matches)).toBe(true);
  });

  it("returns null tomorrow when no future planned events", () => {
    const result = buildIntelScreenData([], [], {}, null, new Date("2026-04-01T00:00:00Z"));
    expect(result.tomorrow).toBeNull();
    expect(result.distance.longestRun).toBeNull();
    expect(result.duringStats.easy).toBeNull();
    expect(result.afterStats.easy).toBeNull();
  });

  it("excludes legacy run_bg_context rows lacking peak60mAboveEnd from after stats", () => {
    const activities: CachedActivity[] = [
      makeActivity({
        activityId: "legacy",
        category: "easy",
        glucose: [
          { time: 0, value: 8.0 },
          { time: 60, value: 5.0 },
        ],
        runBGContext: {
          activityId: "legacy",
          category: "easy",
          pre: { startBG: 8.0, entrySlope30m: 0.0, entryStability: 0.5, readingCount: 6 },
          // Pre-Task-8 row: post exists but peak60mAboveEnd is undefined.
          post: {
            endBG: 5.0,
            recoveryDrop30m: -0.2,
            nadirPostRun: 4.8,
            timeToStable: 30,
            postRunHypo: false,
            readingCount: 6,
            peak30m: 5.5,
            spike30m: 0.5,
          } as never,
          totalBGImpact: -3.0,
        },
      }),
    ];
    const result = buildHistoryData(activities, [], {});
    // Legacy row is gracefully excluded — afterStats stays null instead of
    // producing NaN medians from undefined peak60mAboveEnd.
    expect(result.afterStats.easy).toBeNull();
  });

  it("flags currentBGSource as fallback and surfaces null currentBG when no live reading", () => {
    const events: CalendarEvent[] = [
      {
        id: "e-future",
        date: new Date("2026-04-08T07:00:00Z"),
        name: "W02 Easy",
        description: "",
        type: "planned",
        category: "easy",
        distance: 6000,
        duration: 2100,
      },
    ];
    const tomorrow = buildTomorrowData([], events, {}, null, new Date("2026-04-07T12:00:00Z"));
    expect(tomorrow).not.toBeNull();
    expect(tomorrow?.currentBG).toBeNull();
    expect(tomorrow?.currentBGSource).toBe("fallback");
  });
});
