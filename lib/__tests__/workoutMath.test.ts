import { describe, it, expect } from "vitest";
import { prescribedCarbs } from "../workoutMath";
import { processActivities, processPlannedEvents } from "../calendarPipeline";
import type { IntervalsActivity, IntervalsEvent } from "../types";

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
    expect(completed!.totalCarbs).toBe(descriptionMinutes); // 65g, NOT 97g
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
    expect(planned.totalCarbs).toBe(65);
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
    expect(planned.totalCarbs).toBeNull();
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
    expect(planned.totalCarbs).toBeNull();
  });
});
