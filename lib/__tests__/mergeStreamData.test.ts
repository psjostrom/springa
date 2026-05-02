import { describe, it, expect } from "vitest";
import type { CalendarEvent, DataPoint } from "../types";
import type { ActivityStreamData } from "@/app/hooks/useActivityStream";
import { mergeStreamData } from "../enrichEvents";

const RUN_START = new Date("2026-03-08T10:00:00Z");

const baseEvent: CalendarEvent = {
  id: "e1",
  date: RUN_START,
  name: "Test Run",
  description: "",
  type: "completed",
  category: "easy",
  activityId: "act-1",
  distance: 5000,
  duration: 1800,
  avgHr: 130,
  pace: 360,
  fuelRate: null,
  carbsIngested: null,
};

const hrStream: DataPoint[] = [
  { time: 0, value: 110 },
  { time: 10, value: 130 },
  { time: 20, value: 140 },
  { time: 30, value: 135 },
];

function makeFreshStream(overrides?: Partial<ActivityStreamData>): ActivityStreamData {
  return {
    streamData: { heartrate: hrStream },
    avgHr: 132,
    maxHr: 155,
    ...overrides,
  };
}

describe("mergeStreamData", () => {
  it("overlays fresh stream data onto event", () => {
    const result = mergeStreamData(baseEvent, makeFreshStream());

    expect(result.streamData?.heartrate).toEqual(hrStream);
    expect(result.avgHr).toBe(132);
    expect(result.maxHr).toBe(155);
  });

  it("preserves existing event streamData fields not in fresh stream", () => {
    const event: CalendarEvent = {
      ...baseEvent,
      streamData: { pace: [{ time: 0, value: 6.5 }] },
    };
    const result = mergeStreamData(event, makeFreshStream());

    expect(result.streamData?.pace).toEqual([{ time: 0, value: 6.5 }]);
    expect(result.streamData?.heartrate).toEqual(hrStream);
  });

  it("preserves existing glucose from cache", () => {
    const existingGlucose: DataPoint[] = [
      { time: 0, value: 7.0 },
      { time: 10, value: 6.5 },
    ];
    const event: CalendarEvent = { ...baseEvent, glucose: existingGlucose };

    const result = mergeStreamData(event, makeFreshStream());

    expect(result.glucose).toBe(existingGlucose);
  });

  it("passes through undefined glucose when not cached", () => {
    const result = mergeStreamData(baseEvent, makeFreshStream());

    expect(result.glucose).toBeUndefined();
  });

  it("falls back to event avgHr/maxHr when fresh stream has none", () => {
    const event: CalendarEvent = { ...baseEvent, avgHr: 125, maxHr: 160 };
    const freshStream = makeFreshStream({ avgHr: undefined, maxHr: undefined });

    const result = mergeStreamData(event, freshStream);

    expect(result.avgHr).toBe(125);
    expect(result.maxHr).toBe(160);
  });
});
