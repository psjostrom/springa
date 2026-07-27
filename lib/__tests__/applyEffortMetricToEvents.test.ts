import { describe, it, expect } from "vitest";
import { buildFuturePlannedEffortPatches } from "../applyEffortMetricToEvents";
import { TEST_HR_ZONES, TEST_LTHR } from "./testConstants";
import type { CalendarEvent } from "../types";

const ctx = {
  lthr: TEST_LTHR,
  hrZones: [...TEST_HR_ZONES],
  thresholdPace: 5.5,
};

const easyPace = `Warmup
- Warmup 10m 6:15-7:52/km Pace intensity=warmup

Main set
- Easy 35m 6:15-7:52/km Pace intensity=active

Cooldown
- Cooldown 15m 6:15-7:52/km Pace intensity=cooldown
`;

function tomorrow(hour = 8): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function planned(
  overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "name" | "description">,
): CalendarEvent {
  return {
    type: "planned",
    date: tomorrow(),
    category: "easy",
    ...overrides,
  };
}

describe("buildFuturePlannedEffortPatches", () => {
  it("returns N patches with HR descriptions for future planned events", () => {
    const events = [
      planned({
        id: "event-101",
        name: "W01 Easy",
        description: easyPace,
      }),
      planned({
        id: "event-102",
        name: "W01 Long (10km)",
        description: easyPace,
        date: tomorrow(9),
      }),
    ];

    const { patches, failures } = buildFuturePlannedEffortPatches(events, "hr", ctx);

    expect(failures).toEqual([]);
    expect(patches).toHaveLength(2);
    expect(patches[0]).toMatchObject({
      id: "event-101",
      numericId: 101,
      name: "W01 Easy",
    });
    expect(patches[0].description).toMatch(/% LTHR \(\d+-\d+ bpm\)/);
    expect(patches[0].description).not.toMatch(/\/km Pace/);
    expect(patches[1].id).toBe("event-102");
    expect(patches[1].description).toMatch(/% LTHR/);
  });

  it("skips past and non-planned events", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(8, 0, 0, 0);

    const events: CalendarEvent[] = [
      planned({ id: "event-1", name: "W01 Easy", description: easyPace }),
      {
        id: "event-2",
        type: "planned",
        date: yesterday,
        name: "Old Easy",
        description: easyPace,
        category: "easy",
      },
      {
        id: "activity-9",
        type: "completed",
        date: tomorrow(),
        name: "Completed",
        description: easyPace,
        category: "easy",
      },
    ];

    const { patches, failures } = buildFuturePlannedEffortPatches(events, "hr", ctx);
    expect(failures).toEqual([]);
    expect(patches).toHaveLength(1);
    expect(patches[0].id).toBe("event-1");
  });

  it("records failures for unparseable descriptions without dropping other patches", () => {
    const events = [
      planned({
        id: "event-10",
        name: "W01 Easy",
        description: easyPace,
      }),
      planned({
        id: "event-11",
        name: "Broken",
        description: "- not a valid step\n",
      }),
    ];

    const { patches, failures } = buildFuturePlannedEffortPatches(events, "feel", ctx);
    expect(patches).toHaveLength(1);
    expect(patches[0].name).toBe("W01 Easy By Feel");
    expect(failures).toHaveLength(1);
    expect(failures[0].id).toBe("event-11");
    expect(failures[0].error).toMatch(/Cannot re-emit/);
  });
});
