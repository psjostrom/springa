import { describe, expect, it } from "vitest";
import { processPlannedEvents } from "../calendarPipeline";
import type { IntervalsEvent } from "../types";

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

    const planned = processPlannedEvents(events, new Map(), new Set());

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

    const planned = processPlannedEvents(events, new Map(), new Set());

    expect(planned).toHaveLength(1);
    expect(planned[0].type).toBe("race");
    expect(planned[0].category).toBe("race");
    expect(planned[0].fuelRate).toBe(60);
  });
});
