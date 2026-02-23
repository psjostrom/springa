import { describe, it, expect } from "vitest";
import {
  extractZoneSegments,
  buildCalibratedPaceTable,
  computeZonePaceTrend,
  toPaceTable,
  type ZoneSegment,
} from "../paceCalibration";
import type { DataPoint } from "../types";

// Helper: generate DataPoint array at minute resolution
function minutePoints(values: number[], startMinute = 0): DataPoint[] {
  return values.map((v, i) => ({ time: startMinute + i, value: v }));
}

// LTHR for tests
const LTHR = 169;

// HR values that map to specific zones:
// easy: < 78% = < 131.8
// steady: 78-89% = 131.8-150.4
// tempo: 89-99% = 150.4-167.3
// hard: >= 99% = >= 167.3
const HR_EASY = 120;
const HR_STEADY = 140;
const HR_TEMPO = 155;
const HR_HARD = 175;

describe("extractZoneSegments", () => {
  it("extracts easy segment when >= 3 consecutive minutes", () => {
    const hr = minutePoints([HR_EASY, HR_EASY, HR_EASY, HR_EASY]);
    const pace = minutePoints([7.0, 7.2, 7.1, 7.3]);
    const result = extractZoneSegments(hr, pace, LTHR, "a1", "2026-01-01");

    expect(result).toHaveLength(1);
    expect(result[0].zone).toBe("easy");
    expect(result[0].durationMin).toBe(4);
    expect(result[0].avgPace).toBeCloseTo(7.15, 1);
    expect(result[0].activityId).toBe("a1");
  });

  it("rejects easy segment shorter than 3 minutes", () => {
    const hr = minutePoints([HR_EASY, HR_EASY]);
    const pace = minutePoints([7.0, 7.2]);
    const result = extractZoneSegments(hr, pace, LTHR, "a1", "2026-01-01");

    expect(result).toHaveLength(0);
  });

  it("extracts steady segment when >= 2 consecutive minutes", () => {
    const hr = minutePoints([HR_STEADY, HR_STEADY, HR_STEADY]);
    const pace = minutePoints([5.8, 5.6, 5.7]);
    const result = extractZoneSegments(hr, pace, LTHR, "a1", "2026-01-01");

    expect(result).toHaveLength(1);
    expect(result[0].zone).toBe("steady");
    expect(result[0].durationMin).toBe(3);
  });

  it("extracts tempo segment when >= 1 minute", () => {
    const hr = minutePoints([HR_TEMPO]);
    const pace = minutePoints([5.1]);
    const result = extractZoneSegments(hr, pace, LTHR, "a1", "2026-01-01");

    expect(result).toHaveLength(1);
    expect(result[0].zone).toBe("tempo");
    expect(result[0].durationMin).toBe(1);
  });

  it("never extracts hard segments (always extrapolated)", () => {
    const hr = minutePoints([HR_HARD, HR_HARD, HR_HARD, HR_HARD, HR_HARD]);
    const pace = minutePoints([4.5, 4.4, 4.6, 4.5, 4.3]);
    const result = extractZoneSegments(hr, pace, LTHR, "a1", "2026-01-01");

    expect(result).toHaveLength(0);
  });

  it("extracts multiple segments from zone transitions", () => {
    // 4 min easy → 3 min steady
    const hr = minutePoints([
      HR_EASY, HR_EASY, HR_EASY, HR_EASY,
      HR_STEADY, HR_STEADY, HR_STEADY,
    ]);
    const pace = minutePoints([7.0, 7.1, 7.2, 7.0, 5.8, 5.6, 5.7]);
    const result = extractZoneSegments(hr, pace, LTHR, "a1", "2026-01-01");

    expect(result).toHaveLength(2);
    expect(result[0].zone).toBe("easy");
    expect(result[1].zone).toBe("steady");
  });

  it("filters out pace values outside 2.0-12.0 range", () => {
    const hr = minutePoints([HR_EASY, HR_EASY, HR_EASY]);
    const pace = minutePoints([1.5, 7.0, 15.0]); // 1st and 3rd out of range
    const result = extractZoneSegments(hr, pace, LTHR, "a1", "2026-01-01");

    expect(result).toHaveLength(1);
    // Only the middle value should be valid
    expect(result[0].avgPace).toBeCloseTo(7.0, 1);
  });

  it("returns empty for zero LTHR", () => {
    const hr = minutePoints([HR_EASY, HR_EASY, HR_EASY]);
    const pace = minutePoints([7.0, 7.0, 7.0]);
    expect(extractZoneSegments(hr, pace, 0, "a1", "2026-01-01")).toHaveLength(0);
  });

  it("returns empty for empty inputs", () => {
    expect(extractZoneSegments([], [], LTHR, "a1", "2026-01-01")).toHaveLength(0);
  });
});

describe("buildCalibratedPaceTable", () => {
  function seg(zone: "easy" | "steady" | "tempo", pace: number, dur: number, date = "2026-01-10"): ZoneSegment {
    return { zone, avgPace: pace, avgHr: 140, durationMin: dur, activityId: "a1", activityDate: date };
  }

  it("computes duration-weighted average per zone", () => {
    const segments: ZoneSegment[] = [
      seg("easy", 7.0, 10),
      seg("easy", 7.5, 5), // weighted: (7.0*10 + 7.5*5) / 15 = 7.167
      seg("steady", 5.8, 5),
      seg("tempo", 5.1, 3),
    ];

    const result = buildCalibratedPaceTable(segments);

    expect(result.table.easy.calibrated).toBe(true);
    expect(result.table.easy.pace).toBeCloseTo(7.167, 2);
    expect(result.table.steady.calibrated).toBe(true);
    expect(result.table.steady.pace).toBeCloseTo(5.8, 1);
    expect(result.table.tempo.calibrated).toBe(true);
    expect(result.table.tempo.pace).toBeCloseTo(5.1, 1);
  });

  it("extrapolates hard via linear regression on calibrated zones", () => {
    const segments: ZoneSegment[] = [
      seg("easy", 7.0, 10),
      seg("steady", 6.0, 5),
      seg("tempo", 5.0, 3),
    ];

    const result = buildCalibratedPaceTable(segments);

    expect(result.hardExtrapolated).toBe(true);
    expect(result.table.hard.calibrated).toBe(true);
    // Linear: easy=7, steady=6, tempo=5 → slope=-1, intercept=7 → hard=7+(-1*3)=4.0
    expect(result.table.hard.pace).toBeCloseTo(4.0, 1);
  });

  it("falls back when no segments exist", () => {
    const result = buildCalibratedPaceTable([]);

    expect(result.table.easy.calibrated).toBe(false);
    expect(result.table.steady.calibrated).toBe(false);
    expect(result.table.tempo.calibrated).toBe(false);
    expect(result.table.hard.calibrated).toBe(false);
    expect(result.hardExtrapolated).toBe(false);
    // Fallback values
    expect(result.table.easy.pace).toBeCloseTo(7.25, 1);
    expect(result.table.hard.pace).toBeCloseTo(4.75, 1);
  });

  it("uses fallback for missing zones while calibrating present ones", () => {
    const segments: ZoneSegment[] = [
      seg("easy", 7.0, 10),
      // no steady or tempo
    ];

    const result = buildCalibratedPaceTable(segments);

    expect(result.table.easy.calibrated).toBe(true);
    expect(result.table.steady.calibrated).toBe(false);
    expect(result.table.tempo.calibrated).toBe(false);
    // Can't extrapolate hard with only 1 regression point
    expect(result.table.hard.calibrated).toBe(false);
  });

  it("extrapolates hard with 2 calibrated zones", () => {
    const segments: ZoneSegment[] = [
      seg("easy", 7.0, 10),
      seg("tempo", 5.0, 5),
    ];

    const result = buildCalibratedPaceTable(segments);

    expect(result.hardExtrapolated).toBe(true);
    expect(result.table.hard.calibrated).toBe(true);
    // regression on (0,7) and (2,5) → slope=-1, intercept=7 → hard=4.0
    expect(result.table.hard.pace).toBeCloseTo(4.0, 1);
  });

  it("clamps extrapolated hard to valid pace range", () => {
    // Extreme slopes that would extrapolate beyond bounds
    const segments: ZoneSegment[] = [
      seg("easy", 11.0, 10),
      seg("steady", 10.0, 5),
      seg("tempo", 9.0, 3),
    ];

    const result = buildCalibratedPaceTable(segments);
    // intercept=11, slope=-1 → hard=8.0 — still in range
    expect(result.table.hard.pace).toBeGreaterThanOrEqual(2.0);
    expect(result.table.hard.pace).toBeLessThanOrEqual(12.0);
  });

  it("populates zone summaries", () => {
    const segments: ZoneSegment[] = [
      seg("easy", 7.0, 10),
      seg("easy", 7.5, 5),
      seg("steady", 5.8, 5),
    ];

    const result = buildCalibratedPaceTable(segments);
    const easySummary = result.zoneSummaries.get("easy");

    expect(easySummary).toBeDefined();
    expect(easySummary!.segmentCount).toBe(2);
    expect(easySummary!.totalMinutes).toBe(15);
  });
});

describe("computeZonePaceTrend", () => {
  function trendSeg(zone: "easy" | "steady" | "tempo", pace: number, date: string): ZoneSegment {
    return { zone, avgPace: pace, avgHr: 140, durationMin: 5, activityId: "a1", activityDate: date };
  }

  it("returns negative slope when getting faster", () => {
    const segments: ZoneSegment[] = [
      trendSeg("easy", 7.5, "2026-01-01"),
      trendSeg("easy", 7.3, "2026-01-10"),
      trendSeg("easy", 7.1, "2026-01-20"),
      trendSeg("easy", 6.9, "2026-01-30"),
    ];

    const trend = computeZonePaceTrend(segments, "easy");
    expect(trend).not.toBeNull();
    expect(trend!).toBeLessThan(0); // getting faster
  });

  it("returns positive slope when getting slower", () => {
    const segments: ZoneSegment[] = [
      trendSeg("easy", 6.5, "2026-01-01"),
      trendSeg("easy", 6.8, "2026-01-10"),
      trendSeg("easy", 7.0, "2026-01-20"),
      trendSeg("easy", 7.2, "2026-01-30"),
    ];

    const trend = computeZonePaceTrend(segments, "easy");
    expect(trend).not.toBeNull();
    expect(trend!).toBeGreaterThan(0); // getting slower
  });

  it("returns null with fewer than 3 segments", () => {
    const segments: ZoneSegment[] = [
      trendSeg("easy", 7.5, "2026-01-01"),
      trendSeg("easy", 7.3, "2026-01-15"),
    ];

    expect(computeZonePaceTrend(segments, "easy")).toBeNull();
  });

  it("returns null when time span is less than 14 days", () => {
    const segments: ZoneSegment[] = [
      trendSeg("easy", 7.5, "2026-01-01"),
      trendSeg("easy", 7.3, "2026-01-05"),
      trendSeg("easy", 7.1, "2026-01-10"),
    ];

    expect(computeZonePaceTrend(segments, "easy")).toBeNull();
  });

  it("only considers segments for the requested zone", () => {
    const segments: ZoneSegment[] = [
      trendSeg("easy", 7.5, "2026-01-01"),
      trendSeg("steady", 5.5, "2026-01-10"), // different zone
      trendSeg("easy", 7.3, "2026-01-15"),
      trendSeg("easy", 7.1, "2026-01-25"),
    ];

    const trend = computeZonePaceTrend(segments, "easy");
    expect(trend).not.toBeNull();
    expect(trend!).toBeLessThan(0);
  });

  it("respects windowDays parameter", () => {
    const segments: ZoneSegment[] = [
      trendSeg("easy", 7.5, "2025-01-01"), // way outside 90 day window
      trendSeg("easy", 7.3, "2025-01-15"),
      trendSeg("easy", 7.1, "2025-01-25"),
    ];

    // All outside 90-day window from now → null
    expect(computeZonePaceTrend(segments, "easy", 90)).toBeNull();
  });
});

describe("toPaceTable", () => {
  function seg(zone: "easy" | "steady" | "tempo", pace: number, dur: number): ZoneSegment {
    return { zone, avgPace: pace, avgHr: 140, durationMin: dur, activityId: "a1", activityDate: "2026-01-10" };
  }

  it("converts calibrated zones to PaceTable with avgPace and sampleCount", () => {
    const calibration = buildCalibratedPaceTable([
      seg("easy", 7.0, 10),
      seg("easy", 7.5, 5),
      seg("steady", 5.8, 5),
      seg("tempo", 5.1, 3),
    ]);
    const table = toPaceTable(calibration);

    expect(table.easy).not.toBeNull();
    expect(table.easy!.zone).toBe("easy");
    expect(table.easy!.avgPace).toBeCloseTo(7.167, 2);
    expect(table.easy!.sampleCount).toBe(2);
    expect(table.easy!.avgHr).toBe(140);

    expect(table.steady!.avgPace).toBeCloseTo(5.8, 1);
    expect(table.tempo!.avgPace).toBeCloseTo(5.1, 1);
    expect(table.hard).not.toBeNull(); // extrapolated
  });

  it("falls back to FALLBACK_PACE_TABLE for uncalibrated zones", () => {
    const calibration = buildCalibratedPaceTable([
      seg("easy", 7.0, 10),
    ]);
    const table = toPaceTable(calibration);

    expect(table.easy!.avgPace).toBeCloseTo(7.0, 1);
    // steady/tempo not calibrated → fallback
    expect(table.steady!.avgPace).toBe(5.67);
    expect(table.tempo!.avgPace).toBe(5.21);
    // hard can't be extrapolated with only 1 zone → fallback
    expect(table.hard!.avgPace).toBe(4.75);
  });

  it("returns all non-null entries", () => {
    const calibration = buildCalibratedPaceTable([]);
    const table = toPaceTable(calibration);

    // Even with no data, all zones should be non-null (fallback values)
    expect(table.easy).not.toBeNull();
    expect(table.steady).not.toBeNull();
    expect(table.tempo).not.toBeNull();
    expect(table.hard).not.toBeNull();
  });
});
