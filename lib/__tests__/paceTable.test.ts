import { describe, it, expect } from "vitest";
import {
  getPaceTable,
  estimateGoalTimeFromEasyPace,
  getPaceRangeForZone,
  type PaceTableResult,
} from "../paceTable";

describe("getPaceTable", () => {
  describe("Half Marathon (21.0975km)", () => {
    it("2h20 HM: easy 7.0-7.8, steady 6.5-6.7, tempo 6.0-6.2", () => {
      const result = getPaceTable(21.0975, 8400);
      expect(result.easy.min).toBeGreaterThan(7.0);
      expect(result.easy.min).toBeLessThan(7.1);
      expect(result.easy.max).toBeGreaterThan(7.7);
      expect(result.easy.max).toBeLessThan(7.9);
      expect(result.steady.min).toBeGreaterThan(6.4);
      expect(result.steady.min).toBeLessThan(6.6);
      expect(result.steady.max).toBeGreaterThan(6.6);
      expect(result.steady.max).toBeLessThan(6.8);
      expect(result.tempo.min).toBeGreaterThan(5.9);
      expect(result.tempo.min).toBeLessThan(6.1);
      expect(result.tempo.max).toBeGreaterThan(6.1);
      expect(result.tempo.max).toBeLessThan(6.3);
    });

    it("2h00 HM: easy >6.0 <7.1, steady >5.5 <5.8", () => {
      const result = getPaceTable(21.0975, 7200);
      expect(result.easy.min).toBeGreaterThan(6.0);
      expect(result.easy.min).toBeLessThan(7.1);
      expect(result.steady.min).toBeGreaterThan(5.5);
      expect(result.steady.max).toBeLessThan(5.8);
    });

    it("3h00 HM: easy >8.9 <10.3", () => {
      const result = getPaceTable(21.0975, 10800);
      expect(result.easy.min).toBeGreaterThan(8.9);
      expect(result.easy.max).toBeLessThan(10.3);
    });
  });

  it("paces follow easy > steady > tempo > hard (for HM)", () => {
    const result = getPaceTable(21.0975, 8400);
    expect(result.easy.min).toBeGreaterThan(result.steady.max);
    expect(result.steady.min).toBeGreaterThan(result.tempo.max);
    expect(result.tempo.min).toBeGreaterThan(result.hard);
  });

  it("Ben Parkes 2h20 validation: easy.min ≈7.05, easy.max ≈7.77", () => {
    const result = getPaceTable(21.0975, 8400);
    expect(result.easy.min).toBeCloseTo(7.05, 0);
    expect(result.easy.max).toBeCloseTo(7.77, 0);
  });

  it("hard is a number (not a range)", () => {
    const result = getPaceTable(21.0975, 8400);
    expect(typeof result.hard).toBe("number");
    expect(result.hard).toBeGreaterThan(0);
  });

  it("55min 10K: steady uses actual 10K pace (~5.5), easy based on HM-equivalent", () => {
    const result = getPaceTable(10, 3300);
    // 10K pace = 3300s / 10km = 5.5 min/km
    // steady should be close to actual race pace (0.98-1.01×)
    expect(result.steady.min).toBeGreaterThan(5.3);
    expect(result.steady.min).toBeLessThan(5.5);
    expect(result.steady.max).toBeGreaterThan(5.5);
    expect(result.steady.max).toBeLessThan(5.7);

    // Easy should be based on HM-equivalent pace (slower than 10K pace)
    expect(result.easy.min).toBeGreaterThan(result.racePacePerKm);
  });

  it("4h Marathon: derives paces from HM-equivalent", () => {
    const result = getPaceTable(42.195, 14400);
    // 4h marathon → ~1h53m HM equivalent
    // Easy pace derived from faster HM-equivalent, so may be faster than marathon pace
    // This is correct: marathon pace is conservative, easy runs can be slightly faster
    expect(result.hmEquivalentPacePerKm).toBeLessThan(result.racePacePerKm);
    expect(result.easy.min).toBeGreaterThan(result.hmEquivalentPacePerKm);
  });

  it("stores goal time and distance in result", () => {
    const result = getPaceTable(21.0975, 8400);
    expect(result.goalTimeSecs).toBe(8400);
    expect(result.distanceKm).toBe(21.0975);
  });
});

describe("estimateGoalTimeFromEasyPace", () => {
  it("7.5 min/km → 8400s (2h20), divisible by 300", () => {
    const result = estimateGoalTimeFromEasyPace(7.5);
    expect(result).toBe(8400);
    expect(result % 300).toBe(0);
  });

  it("result is divisible by 300", () => {
    const result = estimateGoalTimeFromEasyPace(6.5);
    expect(result % 300).toBe(0);
  });
});

describe("getPaceRangeForZone", () => {
  const table: PaceTableResult = {
    easy: { min: 7.0, max: 8.1 },
    steady: { min: 6.4, max: 6.8 },
    tempo: { min: 5.9, max: 6.3 },
    hard: 5.6,
    racePacePerKm: 6.6,
    hmEquivalentPacePerKm: 6.6,
    goalTimeSecs: 8400,
    distanceKm: 21.0975,
  };

  it("returns easy range", () => {
    const result = getPaceRangeForZone(table, "easy");
    expect(result).toEqual({ min: 7.0, max: 8.1 });
  });

  it("returns steady range", () => {
    const result = getPaceRangeForZone(table, "steady");
    expect(result).toEqual({ min: 6.4, max: 6.8 });
  });

  it("returns tempo range", () => {
    const result = getPaceRangeForZone(table, "tempo");
    expect(result).toEqual({ min: 5.9, max: 6.3 });
  });

  it("returns null for hard", () => {
    const result = getPaceRangeForZone(table, "hard");
    expect(result).toBeNull();
  });
});
