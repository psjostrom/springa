import { describe, it, expect } from "vitest";
import {
  extractZoneSegments,
  buildCalibratedPaceTable,
  computeZonePaceTrend,
  toPaceTable,
  type ZoneSegment,
} from "../paceCalibration";
import type { DataPoint } from "../types";
import { TEST_HR_ZONES } from "./testConstants";

// Helper: generate DataPoint array at minute resolution
function minutePoints(values: number[], startMinute = 0): DataPoint[] {
  return values.map((v, i) => ({ time: startMinute + i, value: v }));
}

const hrZones = [...TEST_HR_ZONES];

// HR values that map to specific zones with TEST_HR_ZONES [114, 140, 155, 167, 189]:
// z1 (easy): <= 114
// z2: 115-140
// z3: 141-155
// z4: 156-167
// z5: > 167
const HR_EASY = 130;     // z2
const HR_STEADY = 148;   // z3
const HR_TEMPO = 162;    // z4
const HR_HARD = 175;     // z5

describe("extractZoneSegments", () => {
  it("extracts easy segment when >= 3 consecutive minutes", () => {
    const hr = minutePoints([HR_EASY, HR_EASY, HR_EASY, HR_EASY]);
    const pace = minutePoints([7.0, 7.2, 7.1, 7.3]);
    const result = extractZoneSegments(hr, pace, hrZones, "a1", "2026-01-01");

    expect(result).toHaveLength(1);
    expect(result[0].zone).toBe("z2");
    expect(result[0].durationMin).toBe(4);
    expect(result[0].avgPace).toBeCloseTo(7.15, 1);
    expect(result[0].activityId).toBe("a1");
  });

  it("rejects easy segment shorter than 3 minutes", () => {
    const hr = minutePoints([HR_EASY, HR_EASY]);
    const pace = minutePoints([7.0, 7.2]);
    const result = extractZoneSegments(hr, pace, hrZones, "a1", "2026-01-01");

    expect(result).toHaveLength(0);
  });

  it("extracts steady segment when >= 2 consecutive minutes", () => {
    const hr = minutePoints([HR_STEADY, HR_STEADY, HR_STEADY]);
    const pace = minutePoints([5.8, 5.6, 5.7]);
    const result = extractZoneSegments(hr, pace, hrZones, "a1", "2026-01-01");

    expect(result).toHaveLength(1);
    expect(result[0].zone).toBe("z3");
    expect(result[0].durationMin).toBe(3);
  });

  it("extracts tempo segment when >= 1 minute", () => {
    const hr = minutePoints([HR_TEMPO]);
    const pace = minutePoints([5.1]);
    const result = extractZoneSegments(hr, pace, hrZones, "a1", "2026-01-01");

    expect(result).toHaveLength(1);
    expect(result[0].zone).toBe("z4");
    expect(result[0].durationMin).toBe(1);
  });

  it("never extracts hard segments (always extrapolated)", () => {
    const hr = minutePoints([HR_HARD, HR_HARD, HR_HARD, HR_HARD, HR_HARD]);
    const pace = minutePoints([4.5, 4.4, 4.6, 4.5, 4.3]);
    const result = extractZoneSegments(hr, pace, hrZones, "a1", "2026-01-01");

    expect(result).toHaveLength(0);
  });

  it("extracts multiple segments from zone transitions", () => {
    // 4 min easy → 3 min steady
    const hr = minutePoints([
      HR_EASY, HR_EASY, HR_EASY, HR_EASY,
      HR_STEADY, HR_STEADY, HR_STEADY,
    ]);
    const pace = minutePoints([7.0, 7.1, 7.2, 7.0, 5.8, 5.6, 5.7]);
    const result = extractZoneSegments(hr, pace, hrZones, "a1", "2026-01-01");

    expect(result).toHaveLength(2);
    expect(result[0].zone).toBe("z2");
    expect(result[1].zone).toBe("z3");
  });

  it("filters out pace values outside 2.0-12.0 range", () => {
    const hr = minutePoints([HR_EASY, HR_EASY, HR_EASY]);
    const pace = minutePoints([1.5, 7.0, 15.0]); // 1st and 3rd out of range
    const result = extractZoneSegments(hr, pace, hrZones, "a1", "2026-01-01");

    expect(result).toHaveLength(1);
    // Only the middle value should be valid
    expect(result[0].avgPace).toBeCloseTo(7.0, 1);
  });

  it("returns empty for invalid hrZones", () => {
    const hr = minutePoints([HR_EASY, HR_EASY, HR_EASY]);
    const pace = minutePoints([7.0, 7.0, 7.0]);
    expect(extractZoneSegments(hr, pace, [], "a1", "2026-01-01")).toHaveLength(0);
    expect(extractZoneSegments(hr, pace, [100, 120], "a1", "2026-01-01")).toHaveLength(0);
  });

  it("returns empty for empty inputs", () => {
    expect(extractZoneSegments([], [], hrZones, "a1", "2026-01-01")).toHaveLength(0);
  });
});

describe("buildCalibratedPaceTable", () => {
  function seg(zone: "z2" | "z3" | "z4", pace: number, dur: number, date = "2026-01-10"): ZoneSegment {
    return { zone, avgPace: pace, avgHr: 140, durationMin: dur, activityId: "a1", activityDate: date };
  }

  it("computes duration-weighted average per zone", () => {
    const segments: ZoneSegment[] = [
      seg("z2", 7.0, 10),
      seg("z2", 7.5, 5), // weighted: (7.0*10 + 7.5*5) / 15 = 7.167
      seg("z3", 5.8, 5),
      seg("z4", 5.1, 3),
    ];

    const result = buildCalibratedPaceTable(segments);

    expect(result.table.z2.calibrated).toBe(true);
    expect(result.table.z2.pace).toBeCloseTo(7.167, 2);
    expect(result.table.z3.calibrated).toBe(true);
    expect(result.table.z3.pace).toBeCloseTo(5.8, 1);
    expect(result.table.z4.calibrated).toBe(true);
    expect(result.table.z4.pace).toBeCloseTo(5.1, 1);
  });

  it("extrapolates hard via linear regression on calibrated zones", () => {
    const segments: ZoneSegment[] = [
      seg("z2", 7.0, 10),
      seg("z3", 6.0, 5),
      seg("z4", 5.0, 3),
    ];

    const result = buildCalibratedPaceTable(segments);

    expect(result.hardExtrapolated).toBe(true);
    expect(result.table.z5.calibrated).toBe(true);
    // Linear: easy=7, steady=6, tempo=5 → slope=-1, intercept=7 → hard=7+(-1*3)=4.0
    expect(result.table.z5.pace).toBeCloseTo(4.0, 1);
  });

  it("falls back when no segments exist", () => {
    const result = buildCalibratedPaceTable([]);

    expect(result.table.z2.calibrated).toBe(false);
    expect(result.table.z3.calibrated).toBe(false);
    expect(result.table.z4.calibrated).toBe(false);
    expect(result.table.z5.calibrated).toBe(false);
    expect(result.hardExtrapolated).toBe(false);
    // Fallback values
    expect(result.table.z2.pace).toBeCloseTo(7.25, 1);
    expect(result.table.z5.pace).toBeCloseTo(4.75, 1);
  });

  it("uses fallback for missing zones while calibrating present ones", () => {
    const segments: ZoneSegment[] = [
      seg("z2", 7.0, 10),
      // no steady or tempo
    ];

    const result = buildCalibratedPaceTable(segments);

    expect(result.table.z2.calibrated).toBe(true);
    expect(result.table.z3.calibrated).toBe(false);
    expect(result.table.z4.calibrated).toBe(false);
    // Can't extrapolate hard with only 1 regression point
    expect(result.table.z5.calibrated).toBe(false);
  });

  it("extrapolates hard with 2 calibrated zones", () => {
    const segments: ZoneSegment[] = [
      seg("z2", 7.0, 10),
      seg("z4", 5.0, 5),
    ];

    const result = buildCalibratedPaceTable(segments);

    expect(result.hardExtrapolated).toBe(true);
    expect(result.table.z5.calibrated).toBe(true);
    // regression on (0,7) and (2,5) → slope=-1, intercept=7 → hard=4.0
    expect(result.table.z5.pace).toBeCloseTo(4.0, 1);
  });

  it("clamps extrapolated hard to valid pace range", () => {
    // Extreme slopes that would extrapolate beyond bounds
    const segments: ZoneSegment[] = [
      seg("z2", 11.0, 10),
      seg("z3", 10.0, 5),
      seg("z4", 9.0, 3),
    ];

    const result = buildCalibratedPaceTable(segments);
    // intercept=11, slope=-1 → hard=8.0 — still in range
    expect(result.table.z5.pace).toBeGreaterThanOrEqual(2.0);
    expect(result.table.z5.pace).toBeLessThanOrEqual(12.0);
  });

  it("populates zone summaries", () => {
    const segments: ZoneSegment[] = [
      seg("z2", 7.0, 10),
      seg("z2", 7.5, 5),
      seg("z3", 5.8, 5),
    ];

    const result = buildCalibratedPaceTable(segments);
    const easySummary = result.zoneSummaries.get("z2");

    expect(easySummary).toBeDefined();
    expect(easySummary!.segmentCount).toBe(2);
    expect(easySummary!.totalMinutes).toBe(15);
  });
});

describe("computeZonePaceTrend", () => {
  /** Return an ISO date string N days ago from now. */
  function daysAgo(n: number): string {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function trendSeg(zone: "z2" | "z3" | "z4", pace: number, date: string): ZoneSegment {
    return { zone, avgPace: pace, avgHr: 140, durationMin: 5, activityId: "a1", activityDate: date };
  }

  it("returns negative slope when getting faster", () => {
    const segments: ZoneSegment[] = [
      trendSeg("z2", 7.6, daysAgo(85)),
      trendSeg("z2", 7.5, daysAgo(70)),
      trendSeg("z2", 7.3, daysAgo(55)),
      trendSeg("z2", 7.2, daysAgo(40)),
      trendSeg("z2", 7.0, daysAgo(25)),
      trendSeg("z2", 6.9, daysAgo(10)),
    ];

    const trend = computeZonePaceTrend(segments, "z2");
    expect(trend).not.toBeNull();
    expect(trend!).toBeLessThan(0); // getting faster
  });

  it("returns positive slope when getting slower", () => {
    const segments: ZoneSegment[] = [
      trendSeg("z2", 6.4, daysAgo(85)),
      trendSeg("z2", 6.5, daysAgo(70)),
      trendSeg("z2", 6.7, daysAgo(55)),
      trendSeg("z2", 6.9, daysAgo(40)),
      trendSeg("z2", 7.1, daysAgo(25)),
      trendSeg("z2", 7.2, daysAgo(10)),
    ];

    const trend = computeZonePaceTrend(segments, "z2");
    expect(trend).not.toBeNull();
    expect(trend!).toBeGreaterThan(0); // getting slower
  });

  it("returns null with fewer than 6 segments", () => {
    const segments: ZoneSegment[] = [
      trendSeg("z2", 7.5, daysAgo(60)),
      trendSeg("z2", 7.3, daysAgo(45)),
      trendSeg("z2", 7.1, daysAgo(30)),
      trendSeg("z2", 7.0, daysAgo(20)),
      trendSeg("z2", 6.9, daysAgo(15)),
    ];

    expect(computeZonePaceTrend(segments, "z2")).toBeNull();
  });

  it("returns null when time span is less than 14 days", () => {
    const segments: ZoneSegment[] = [
      trendSeg("z2", 7.5, daysAgo(13)),
      trendSeg("z2", 7.4, daysAgo(11)),
      trendSeg("z2", 7.3, daysAgo(9)),
      trendSeg("z2", 7.2, daysAgo(7)),
      trendSeg("z2", 7.1, daysAgo(5)),
      trendSeg("z2", 7.0, daysAgo(3)),
    ];

    expect(computeZonePaceTrend(segments, "z2")).toBeNull();
  });

  it("only considers segments for the requested zone", () => {
    const segments: ZoneSegment[] = [
      trendSeg("z2", 7.6, daysAgo(85)),
      trendSeg("z3", 5.5, daysAgo(75)), // different zone — excluded
      trendSeg("z2", 7.5, daysAgo(70)),
      trendSeg("z2", 7.3, daysAgo(55)),
      trendSeg("z2", 7.2, daysAgo(40)),
      trendSeg("z2", 7.0, daysAgo(25)),
      trendSeg("z2", 6.9, daysAgo(10)),
    ];

    const trend = computeZonePaceTrend(segments, "z2");
    expect(trend).not.toBeNull();
    expect(trend!).toBeLessThan(0);
  });

  it("respects windowDays parameter", () => {
    const segments: ZoneSegment[] = [
      trendSeg("z2", 7.5, daysAgo(200)),
      trendSeg("z2", 7.4, daysAgo(190)),
      trendSeg("z2", 7.3, daysAgo(180)),
      trendSeg("z2", 7.2, daysAgo(175)),
      trendSeg("z2", 7.1, daysAgo(165)),
      trendSeg("z2", 7.0, daysAgo(160)),
    ];

    // All outside 90-day window from now → null
    expect(computeZonePaceTrend(segments, "z2", 90)).toBeNull();
  });

  it("excludes segments before baselineMs", () => {
    const baseline = Date.now() - 50 * 86400000; // 50 days ago
    const segments: ZoneSegment[] = [
      // Before baseline — excluded
      trendSeg("z2", 7.5, daysAgo(80)),
      trendSeg("z2", 7.3, daysAgo(60)),
      // After baseline — 6 segments spanning >14 days
      trendSeg("z2", 7.2, daysAgo(45)),
      trendSeg("z2", 7.1, daysAgo(38)),
      trendSeg("z2", 7.0, daysAgo(30)),
      trendSeg("z2", 6.9, daysAgo(25)),
      trendSeg("z2", 6.8, daysAgo(18)),
      trendSeg("z2", 6.7, daysAgo(10)),
    ];

    // Without baseline: all 8 segments → trend exists
    const withoutBaseline = computeZonePaceTrend(segments, "z2");
    expect(withoutBaseline).not.toBeNull();

    // With baseline: only 6 post-baseline segments → still enough
    const withBaseline = computeZonePaceTrend(segments, "z2", 90, baseline);
    expect(withBaseline).not.toBeNull();

    // With recent baseline: only 2 post-baseline segments → insufficient
    const recentBaseline = Date.now() - 20 * 86400000;
    const withRecentBaseline = computeZonePaceTrend(segments, "z2", 90, recentBaseline);
    expect(withRecentBaseline).toBeNull();
  });
});

describe("toPaceTable", () => {
  function seg(zone: "z2" | "z3" | "z4", pace: number, dur: number): ZoneSegment {
    return { zone, avgPace: pace, avgHr: 140, durationMin: dur, activityId: "a1", activityDate: "2026-01-10" };
  }

  it("converts calibrated zones to PaceTable with avgPace and sampleCount", () => {
    const calibration = buildCalibratedPaceTable([
      seg("z2", 7.0, 10),
      seg("z2", 7.5, 5),
      seg("z3", 5.8, 5),
      seg("z4", 5.1, 3),
    ]);
    const table = toPaceTable(calibration);

    expect(table.z2).not.toBeNull();
    expect(table.z2!.zone).toBe("z2");
    expect(table.z2!.avgPace).toBeCloseTo(7.167, 2);
    expect(table.z2!.sampleCount).toBe(2);
    expect(table.z2!.avgHr).toBe(140);

    expect(table.z3!.avgPace).toBeCloseTo(5.8, 1);
    expect(table.z4!.avgPace).toBeCloseTo(5.1, 1);
    expect(table.z5).not.toBeNull(); // extrapolated
  });

  it("falls back to FALLBACK_PACE_TABLE for uncalibrated zones", () => {
    const calibration = buildCalibratedPaceTable([
      seg("z2", 7.0, 10),
    ]);
    const table = toPaceTable(calibration);

    expect(table.z2!.avgPace).toBeCloseTo(7.0, 1);
    // steady/tempo not calibrated → fallback
    expect(table.z3!.avgPace).toBe(5.67);
    expect(table.z4!.avgPace).toBe(5.21);
    // hard can't be extrapolated with only 1 zone → fallback
    expect(table.z5!.avgPace).toBe(4.75);
  });

  it("returns all non-null entries", () => {
    const calibration = buildCalibratedPaceTable([]);
    const table = toPaceTable(calibration);

    // Even with no data, all zones should be non-null (fallback values)
    expect(table.z2).not.toBeNull();
    expect(table.z3).not.toBeNull();
    expect(table.z4).not.toBeNull();
    expect(table.z5).not.toBeNull();
  });
});
