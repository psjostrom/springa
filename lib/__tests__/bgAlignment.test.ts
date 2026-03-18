import { describe, it, expect } from "vitest";
import { interpolateBG, alignHRWithBG, bgToGlucosePoints, enrichWithGlucose } from "../bgAlignment";
import type { BGReading } from "../cgm";
import type { DataPoint } from "../types";
import type { CachedActivity } from "../activityStreamsDb";

function makeReading(ts: number, mmol: number): BGReading {
  return { ts, mmol, sgv: Math.round(mmol * 18), direction: "Flat" };
}

describe("interpolateBG", () => {
  it("returns null for empty readings", () => {
    expect(interpolateBG([], 1000)).toBeNull();
  });

  it("returns first reading when target is before all readings", () => {
    const readings = [makeReading(1000, 10.0), makeReading(2000, 9.0)];
    expect(interpolateBG(readings, 500)).toBe(10.0);
  });

  it("returns last reading when target is after all readings", () => {
    const readings = [makeReading(1000, 10.0), makeReading(2000, 9.0)];
    expect(interpolateBG(readings, 3000)).toBe(9.0);
  });

  it("returns exact value when target matches a reading", () => {
    const readings = [makeReading(1000, 10.0), makeReading(2000, 9.0)];
    expect(interpolateBG(readings, 1000)).toBe(10.0);
    expect(interpolateBG(readings, 2000)).toBe(9.0);
  });

  it("interpolates linearly between readings", () => {
    const readings = [makeReading(1000, 10.0), makeReading(2000, 9.0)];
    // Midpoint: should be 9.5
    expect(interpolateBG(readings, 1500)).toBe(9.5);
    // 25% through: should be 9.75
    expect(interpolateBG(readings, 1250)).toBe(9.75);
    // 75% through: should be 9.25
    expect(interpolateBG(readings, 1750)).toBe(9.25);
  });

  it("interpolates correctly with rising BG", () => {
    const readings = [makeReading(1000, 8.0), makeReading(2000, 12.0)];
    // Midpoint: should be 10.0
    expect(interpolateBG(readings, 1500)).toBe(10.0);
  });

  it("handles multiple readings", () => {
    const readings = [
      makeReading(0, 10.0),
      makeReading(300000, 9.0),    // 5 min
      makeReading(600000, 8.5),    // 10 min
      makeReading(900000, 8.0),    // 15 min
    ];
    // At minute 2.5 (150000ms): between 10.0 and 9.0, halfway
    expect(interpolateBG(readings, 150000)).toBe(9.5);
    // At minute 7.5 (450000ms): between 9.0 and 8.5, halfway
    expect(interpolateBG(readings, 450000)).toBe(8.75);
  });
});

describe("alignHRWithBG", () => {
  const runStartMs = 1000000; // arbitrary start time

  it("returns null for empty readings", () => {
    const hrPoints: DataPoint[] = [{ time: 0, value: 120 }];
    expect(alignHRWithBG(hrPoints, [], runStartMs)).toBeNull();
  });

  it("returns null for empty HR points", () => {
    const readings = [makeReading(runStartMs, 10.0)];
    expect(alignHRWithBG([], readings, runStartMs)).toBeNull();
  });

  it("aligns HR with interpolated BG", () => {
    // BG readings at minute 0 and 5
    const readings = [
      makeReading(runStartMs, 10.0),
      makeReading(runStartMs + 5 * 60000, 9.0),
    ];
    // HR at every minute
    const hrPoints: DataPoint[] = [
      { time: 0, value: 110 },
      { time: 1, value: 120 },
      { time: 2, value: 130 },
      { time: 3, value: 140 },
      { time: 4, value: 145 },
      { time: 5, value: 150 },
    ];

    const result = alignHRWithBG(hrPoints, readings, runStartMs);

    expect(result).not.toBeNull();
    expect(result!.hr).toHaveLength(6);
    expect(result!.glucose).toHaveLength(6);

    // Check interpolated glucose values (startBG derived from glucose[0].value)
    expect(result!.glucose[0].value).toBe(10.0);  // minute 0
    expect(result!.glucose[1].value).toBe(9.8);   // minute 1: 10 - 0.2
    expect(result!.glucose[2].value).toBe(9.6);   // minute 2: 10 - 0.4
    expect(result!.glucose[3].value).toBe(9.4);   // minute 3: 10 - 0.6
    expect(result!.glucose[4].value).toBeCloseTo(9.2);   // minute 4: 10 - 0.8
    expect(result!.glucose[5].value).toBe(9.0);   // minute 5
  });

  it("preserves HR values", () => {
    const readings = [makeReading(runStartMs, 10.0)];
    const hrPoints: DataPoint[] = [
      { time: 0, value: 110 },
      { time: 5, value: 150 },
    ];

    const result = alignHRWithBG(hrPoints, readings, runStartMs);

    expect(result!.hr[0]).toEqual({ time: 0, value: 110 });
    expect(result!.hr[1]).toEqual({ time: 5, value: 150 });
  });
});

describe("bgToGlucosePoints", () => {
  const runStartMs = 0;

  it("returns empty for empty readings", () => {
    expect(bgToGlucosePoints([], runStartMs, 600000)).toEqual([]);
  });

  it("creates minute-by-minute points with interpolation", () => {
    // 10-minute run with readings at 0 and 5 min
    const readings = [
      makeReading(0, 10.0),
      makeReading(300000, 9.0),  // 5 min
    ];
    const runEndMs = 600000; // 10 min

    const points = bgToGlucosePoints(readings, runStartMs, runEndMs);

    expect(points).toHaveLength(11); // 0 to 10 inclusive
    expect(points[0]).toEqual({ time: 0, value: 10.0 });
    expect(points[1]).toEqual({ time: 1, value: 9.8 });
    expect(points[2]).toEqual({ time: 2, value: 9.6 });
    expect(points[5]).toEqual({ time: 5, value: 9.0 });
    // After last reading, uses last value
    expect(points[10]).toEqual({ time: 10, value: 9.0 });
  });
});

describe("enrichWithGlucose", () => {
  it("aligns glucose from CGM readings for activities without glucose", () => {
    const activities: CachedActivity[] = [{
      activityId: "a1",
      category: "easy",
      fuelRate: 48,
      hr: [
        { time: 0, value: 120 },
        { time: 1, value: 125 },
        { time: 2, value: 130 },
      ],
      runStartMs: 1000000,
    }];

    const readings: BGReading[] = [
      { ts: 1000000, mmol: 8.0, sgv: 144, direction: "Flat" },
      { ts: 1060000, mmol: 7.5, sgv: 135, direction: "Flat" },
      { ts: 1120000, mmol: 7.0, sgv: 126, direction: "Flat" },
    ];

    const result = enrichWithGlucose(activities, readings);
    expect(result[0].glucose).toHaveLength(3);
    expect(result[0].glucose![0].value).toBeCloseTo(8.0);
    expect(result[0].glucose![2].value).toBeCloseTo(7.0);
  });

  it("returns undefined glucose for activities without runStartMs", () => {
    const activities: CachedActivity[] = [{
      activityId: "a1",
      category: "easy",
      fuelRate: 48,
      hr: [{ time: 0, value: 120 }],
    }];

    const result = enrichWithGlucose(activities, [{ ts: 1000000, mmol: 8.0, sgv: 144, direction: "Flat" }]);
    expect(result[0].glucose).toBeUndefined();
  });

  it("returns undefined glucose when no readings provided", () => {
    const activities: CachedActivity[] = [{
      activityId: "a1",
      category: "easy",
      fuelRate: 48,
      hr: [{ time: 0, value: 120 }],
      runStartMs: 1000000,
    }];

    const result = enrichWithGlucose(activities, []);
    expect(result[0].glucose).toBeUndefined();
  });
});
