import { describe, expect, it } from "vitest";
import { processPlannedEvents } from "../calendarPipeline";
import type { IntervalsEvent } from "../types";
import type { WorkoutEstimationContext } from "../workoutMath";

describe("processPlannedEvents race classification", () => {
  it("keeps RACE TEST long runs as planned", () => {
    const events: IntervalsEvent[] = [
      {
        id: 101,
        category: "WORKOUT",
        external_id: "long-14",
        start_date_local: "2026-05-17T12:00:00",
        name: "W14 Long (16km) [RACE TEST]",
        description: "- 98m 60-88% pace",
        carbs_per_hour: 56,
      },
    ];

    const planned = processPlannedEvents(events, new Map(), new Set(), {});

    expect(planned).toHaveLength(1);
    expect(planned[0].type).toBe("planned");
    expect(planned[0].category).toBe("long");
    expect(planned[0].fuelRate).toBe(56);
  });

  it("classifies RACE DAY as race", () => {
    const events: IntervalsEvent[] = [
      {
        id: 102,
        category: "WORKOUT",
        external_id: "race",
        start_date_local: "2026-06-13T12:00:00",
        name: "RACE DAY",
        description: "RACE DAY! 16km.",
        carbs_per_hour: 60,
      },
    ];

    const planned = processPlannedEvents(events, new Map(), new Set(), {});

    expect(planned).toHaveLength(1);
    expect(planned[0].type).toBe("race");
    expect(planned[0].category).toBe("race");
    expect(planned[0].fuelRate).toBe(60);
  });
});

describe("processPlannedEvents timezone resolution", () => {
  // Stockholm is UTC+1 in winter, UTC+2 in summer (CEST). Pick a summer date
  // to exercise the DST path.
  const SUMMER_EVENT: IntervalsEvent = {
    id: 200,
    category: "WORKOUT",
    external_id: "easy",
    start_date_local: "2026-07-15T10:00:00", // 10:00 in user's local time
    name: "W20 Easy",
    description: "",
  };

  it("resolves start_date_local through the user timezone (CEST: 10:00 local → 08:00 UTC)", () => {
    const context: WorkoutEstimationContext = { timezone: "Europe/Stockholm" };
    const [planned] = processPlannedEvents([SUMMER_EVENT], new Map(), new Set(), context);
    // 10:00 in Stockholm summer (UTC+2) is 08:00 UTC.
    expect(planned.date.toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });

  it("resolves start_date_local through New York timezone (EDT: 10:00 local → 14:00 UTC)", () => {
    const context: WorkoutEstimationContext = { timezone: "America/New_York" };
    const [planned] = processPlannedEvents([SUMMER_EVENT], new Map(), new Set(), context);
    // 10:00 in New York summer (UTC-4) is 14:00 UTC.
    expect(planned.date.toISOString()).toBe("2026-07-15T14:00:00.000Z");
  });

  it("falls back to Europe/Stockholm when context.timezone is omitted", () => {
    const [planned] = processPlannedEvents([SUMMER_EVENT], new Map(), new Set(), {});
    expect(planned.date.toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });
});
