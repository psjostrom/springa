import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prescribedCarbs } from "../workoutMath";
import { processActivities, processPlannedEvents } from "../calendarPipeline";
import type { IntervalsActivity, IntervalsEvent } from "../types";

let originalConsoleLog: typeof console.log;

beforeEach(() => {
  originalConsoleLog = console.log;
  console.log = () => {};
});

afterEach(() => {
  console.log = originalConsoleLog;
});

describe("prescribedCarbs", () => {
  it("computes carbs from description duration and fuel rate", () => {
    expect(prescribedCarbs("- 41m 68-83% pace", 60)).toBe(41);
  });

  it("returns null when description is missing", () => {
    expect(prescribedCarbs(undefined, 60)).toBeNull();
    expect(prescribedCarbs("", 60)).toBeNull();
  });

  it("returns null when fuel rate is missing", () => {
    expect(prescribedCarbs("- 41m 68-83% pace", null)).toBeNull();
    expect(prescribedCarbs("- 41m 68-83% pace", undefined)).toBeNull();
  });

  it("returns null when description has no parseable steps", () => {
    expect(prescribedCarbs("Race day! Have fun.", 60)).toBeNull();
  });
});

describe("prescribed carbs after activity pairing", () => {
  it("uses description duration, not the actual run time from the paired event", () => {
    // Regression: Intervals.icu overwrites event.moving_time with the activity's
    // actual time after pairing. Prescribed carbs must come from the description
    // (the prescription), never from actual run time.
    const description = "Warmup\n- 10m 68-83% pace\n\nMain set\n- 40m 68-83% pace\n\nCooldown\n- 15m 68-83% pace\n";
    // Description parses to 65 min → 65g at 60g/h
    const descriptionMinutes = 65;

    const activity: IntervalsActivity = {
      id: "act-paired",
      start_date: "2026-04-19T10:00:00Z",
      start_date_local: "2026-04-19T10:00:00",
      name: "W08 Easy",
      type: "Run",
      distance: 8500,
      moving_time: 97 * 60, // 97 min actual — longer than planned
      paired_event_id: 5001,
    };

    const event: IntervalsEvent = {
      id: 5001,
      category: "WORKOUT",
      start_date_local: "2026-04-19T10:00:00",
      name: "W08 Easy",
      description,
      carbs_per_hour: 60,
      paired_activity_id: "act-paired",
      moving_time: 97 * 60, // Intervals.icu copies actual time here after pairing
    };

    const { calendarEvents } = processActivities([activity], [event]);
    const completed = calendarEvents.find((e) => e.activityId === "act-paired");

    expect(completed).toBeDefined();
    // Pipeline no longer computes totalCarbs (it's derived at display).
    // The carb total is computed from description + fuelRate via prescribedCarbs,
    // which is the only place duration is reduced from the description.
    expect(prescribedCarbs(completed!.description, completed!.fuelRate)).toBe(descriptionMinutes); // 65g, NOT 97g
  });
});

describe("prescribed carbs in planned events", () => {
  const description = "Warmup\n- 10m 68-83% pace\n\nMain set\n- 40m 68-83% pace\n\nCooldown\n- 15m 68-83% pace\n";

  it("computes totalCarbs from description and fuel rate", () => {
    const event: IntervalsEvent = {
      id: 9001,
      category: "WORKOUT",
      start_date_local: "2026-04-20T08:00:00",
      name: "W09 Easy",
      description,
      carbs_per_hour: 60,
    };

    const [planned] = processPlannedEvents([event], new Map(), new Set());
    expect(prescribedCarbs(planned.description, planned.fuelRate)).toBe(65);
  });

  it("returns null totalCarbs when description is unparseable", () => {
    const event: IntervalsEvent = {
      id: 9002,
      category: "WORKOUT",
      start_date_local: "2026-04-20T08:00:00",
      name: "Race Day",
      description: "Race day! Have fun.",
      carbs_per_hour: 60,
    };

    const [planned] = processPlannedEvents([event], new Map(), new Set());
    expect(prescribedCarbs(planned.description, planned.fuelRate)).toBeNull();
  });

  it("returns null totalCarbs when fuel rate is null", () => {
    const event: IntervalsEvent = {
      id: 9003,
      category: "WORKOUT",
      start_date_local: "2026-04-20T08:00:00",
      name: "W09 Easy",
      description,
    };

    const [planned] = processPlannedEvents([event], new Map(), new Set());
    expect(prescribedCarbs(planned.description, planned.fuelRate)).toBeNull();
  });
});

describe("prescribedCarbs — wide easy zone with threshold", () => {
  // Regression: an 8 km easy run with absPace "6:27-18:54/km Pace" gave 177g at 56g/h
  // because prescribedCarbs ignored threshold pace. Without threshold the duration
  // estimate uses the literal walking-pace midpoint; with threshold it classifies the
  // intensity and uses the user's typical zone pace via paceForIntensity.
  const desc = `- 8km 6:27-18:54/km Pace intensity=active`;

  it("inflates duration without threshold (degraded fallback)", () => {
    // 8km × ~12.7 min/km midpoint = ~101 min × 60g/h = ~101g
    const carbs = prescribedCarbs(desc, 60);
    expect(carbs).toBeGreaterThan(95);
    expect(carbs).toBeLessThan(110);
  });

  it("computes a sane carb total when threshold is provided", () => {
    // intensity = 5.5 / 12.675 * 100 ≈ 43% → fallback z2 = 7.25 min/km
    // 8km × 7.25 = 58 min × 60g/h ÷ 60 = ~58g
    const carbs = prescribedCarbs(desc, 60, undefined, 5.5);
    expect(carbs).toBeGreaterThan(50);
    expect(carbs).toBeLessThan(65);
  });
});
