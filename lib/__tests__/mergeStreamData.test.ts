import { describe, it, expect } from "vitest";
import type { CalendarEvent, DataPoint } from "../types";
import type { ActivityStreamData } from "@/app/hooks/useActivityStream";
import type { BGReading } from "../cgm";
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
  totalCarbs: null,
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

function makeReadings(startMs: number, count: number, baseMmol: number): BGReading[] {
  // One reading every 5 minutes
  return Array.from({ length: count }, (_, i) => ({
    ts: startMs + i * 5 * 60 * 1000,
    sgv: Math.round((baseMmol + i * 0.2) * 18),
    mmol: baseMmol + i * 0.2,
    direction: "Flat" as const,
    delta: 0,
  }));
}

describe("mergeStreamData", () => {
  it("overlays fresh stream data onto event", () => {
    const result = mergeStreamData(baseEvent, makeFreshStream(), []);

    expect(result.streamData?.heartrate).toEqual(hrStream);
    expect(result.avgHr).toBe(132);
    expect(result.maxHr).toBe(155);
  });

  it("preserves existing event streamData fields not in fresh stream", () => {
    const event: CalendarEvent = {
      ...baseEvent,
      streamData: { pace: [{ time: 0, value: 6.5 }] },
    };
    const result = mergeStreamData(event, makeFreshStream(), []);

    expect(result.streamData?.pace).toEqual([{ time: 0, value: 6.5 }]);
    expect(result.streamData?.heartrate).toEqual(hrStream);
  });

  it("preserves existing glucose when already present on event", () => {
    const existingGlucose: DataPoint[] = [
      { time: 0, value: 7.0 },
      { time: 10, value: 6.5 },
    ];
    const event: CalendarEvent = { ...baseEvent, glucose: existingGlucose };
    const readings = makeReadings(RUN_START.getTime(), 10, 8.0);

    const result = mergeStreamData(event, makeFreshStream(), readings);

    // Should keep existing glucose, not reconstruct
    expect(result.glucose).toBe(existingGlucose);
  });

  it("reconstructs glucose from CGM readings for recent runs", () => {
    const recentStart = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const recentEvent: CalendarEvent = { ...baseEvent, date: recentStart };
    const readings = makeReadings(recentStart.getTime(), 10, 7.0);

    const result = mergeStreamData(recentEvent, makeFreshStream(), readings);

    expect(result.glucose).toBeDefined();
    expect(result.glucose!.length).toBeGreaterThanOrEqual(2);
    expect(result.glucose![0].value).toBeCloseTo(7.0, 0);
  });

  it("does not reconstruct glucose for runs older than 24h", () => {
    const oldStart = new Date(Date.now() - 48 * 60 * 60 * 1000); // 2 days ago
    const oldEvent: CalendarEvent = { ...baseEvent, date: oldStart };
    const readings = makeReadings(Date.now() - 12 * 60 * 60 * 1000, 10, 5.8);

    const result = mergeStreamData(oldEvent, makeFreshStream(), readings);

    expect(result.glucose).toBeUndefined();
  });

  it("does not reconstruct glucose when no heartrate data available", () => {
    const readings = makeReadings(RUN_START.getTime(), 10, 7.0);
    const noHrStream = makeFreshStream({ streamData: {} });

    const result = mergeStreamData(baseEvent, noHrStream, readings);

    expect(result.glucose).toBeUndefined();
  });

  it("does not reconstruct glucose when no CGM readings available", () => {
    const result = mergeStreamData(baseEvent, makeFreshStream(), []);

    expect(result.glucose).toBeUndefined();
  });

  it("falls back to event avgHr/maxHr when fresh stream has none", () => {
    const event: CalendarEvent = { ...baseEvent, avgHr: 125, maxHr: 160 };
    const freshStream = makeFreshStream({ avgHr: undefined, maxHr: undefined });

    const result = mergeStreamData(event, freshStream, []);

    expect(result.avgHr).toBe(125);
    expect(result.maxHr).toBe(160);
  });
});
