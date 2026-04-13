import { describe, it, expect } from "vitest";
import { categoryFromExternalId, temperatureCorrectHr, computeCardiacCostTrend } from "../paceInsight";
import type { ZoneSegment } from "../paceCalibration";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function z2Seg(hr: number, pace: number, date: string): ZoneSegment {
  return { zone: "z2", avgHr: hr, avgPace: pace, durationMin: 10, activityId: "a1", activityDate: date };
}

describe("categoryFromExternalId", () => {
  it("maps speed prefix to interval", () => {
    expect(categoryFromExternalId("speed-5")).toBe("interval");
  });

  it("maps club prefix to interval", () => {
    expect(categoryFromExternalId("club-3")).toBe("interval");
  });

  it("maps easy prefix to easy", () => {
    expect(categoryFromExternalId("easy-5-3")).toBe("easy");
  });

  it("maps free prefix to easy", () => {
    expect(categoryFromExternalId("free-5-3")).toBe("easy");
  });

  it("maps long prefix to long", () => {
    expect(categoryFromExternalId("long-5")).toBe("long");
  });

  it("maps race prefix to race", () => {
    expect(categoryFromExternalId("race")).toBe("race");
  });

  it("maps ondemand prefix to other", () => {
    expect(categoryFromExternalId("ondemand-2026-04-13")).toBe("other");
  });

  it("returns null for unknown prefix", () => {
    expect(categoryFromExternalId("unknown-123")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(categoryFromExternalId(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(categoryFromExternalId("")).toBeNull();
  });
});

describe("temperatureCorrectHr", () => {
  it("returns uncorrected HR below 15C threshold", () => {
    expect(temperatureCorrectHr(140, 0)).toBe(140); // Jan (-1C)
    expect(temperatureCorrectHr(140, 3)).toBe(140); // Apr (7C)
    expect(temperatureCorrectHr(140, 4)).toBe(140); // May (12C)
  });

  it("corrects HR above 15C threshold", () => {
    // June = 17C -> correction = (17-15) * 1.8 = 3.6
    expect(temperatureCorrectHr(140, 5)).toBeCloseTo(136.4, 1);
    // July = 20C -> correction = (20-15) * 1.8 = 9.0
    expect(temperatureCorrectHr(140, 6)).toBeCloseTo(131, 1);
    // August = 19C -> correction = (19-15) * 1.8 = 7.2
    expect(temperatureCorrectHr(140, 7)).toBeCloseTo(132.8, 1);
  });

  it("handles month 11 (December, 0C) with no correction", () => {
    expect(temperatureCorrectHr(150, 11)).toBe(150);
  });
});

describe("computeCardiacCostTrend", () => {
  it("returns negative change when cardiac cost is dropping (improvement)", () => {
    const segments: ZoneSegment[] = [
      z2Seg(145, 7.0, daysAgo(50)),
      z2Seg(144, 7.0, daysAgo(46)),
      z2Seg(146, 7.0, daysAgo(42)),
      z2Seg(145, 7.0, daysAgo(38)),
      z2Seg(135, 7.0, daysAgo(22)),
      z2Seg(136, 7.0, daysAgo(18)),
      z2Seg(134, 7.0, daysAgo(14)),
      z2Seg(135, 7.0, daysAgo(10)),
    ];
    const result = computeCardiacCostTrend(segments);
    expect(result).not.toBeNull();
    expect(result!.changePercent).toBeLessThan(-3);
    expect(result!.direction).toBe("improving");
  });

  it("returns positive change when cardiac cost is rising (regression)", () => {
    const segments: ZoneSegment[] = [
      z2Seg(135, 7.0, daysAgo(50)),
      z2Seg(136, 7.0, daysAgo(46)),
      z2Seg(134, 7.0, daysAgo(42)),
      z2Seg(135, 7.0, daysAgo(38)),
      z2Seg(148, 7.0, daysAgo(22)),
      z2Seg(149, 7.0, daysAgo(18)),
      z2Seg(147, 7.0, daysAgo(14)),
      z2Seg(148, 7.0, daysAgo(10)),
    ];
    const result = computeCardiacCostTrend(segments);
    expect(result).not.toBeNull();
    expect(result!.changePercent).toBeGreaterThan(5);
    expect(result!.direction).toBe("regressing");
  });

  it("returns null when change is within noise range", () => {
    const segments: ZoneSegment[] = [
      z2Seg(140, 7.0, daysAgo(50)),
      z2Seg(141, 7.0, daysAgo(46)),
      z2Seg(139, 7.0, daysAgo(42)),
      z2Seg(140, 7.0, daysAgo(38)),
      z2Seg(140, 7.0, daysAgo(22)),
      z2Seg(141, 7.0, daysAgo(18)),
      z2Seg(139, 7.0, daysAgo(14)),
      z2Seg(140, 7.0, daysAgo(10)),
    ];
    expect(computeCardiacCostTrend(segments)).toBeNull();
  });

  it("returns null with insufficient data in either window", () => {
    const segments: ZoneSegment[] = [
      z2Seg(145, 7.0, daysAgo(50)),
      z2Seg(144, 7.0, daysAgo(46)),
      z2Seg(135, 7.0, daysAgo(22)),
      z2Seg(136, 7.0, daysAgo(18)),
      z2Seg(134, 7.0, daysAgo(14)),
      z2Seg(135, 7.0, daysAgo(10)),
    ];
    expect(computeCardiacCostTrend(segments)).toBeNull();
  });
});
