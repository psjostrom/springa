import { describe, it, expect } from "vitest";
import {
  getPaceTable,
  estimateGoalTimeFromEasyPace,
  getPaceRangeForZone,
  getDefaultGoalTime,
  getSliderRange,
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
    expect(result.abilitySecs).toBe(8400);
    expect(result.abilityDistKm).toBe(21.0975);
  });
});

describe("getPaceTable with separate goal", () => {
  it("steady uses goal race pace when goal is provided", () => {
    // 10K ability in 55:00, EcoTrail 16km goal in 2:20
    const result = getPaceTable(10, 3300, 16, 8400);
    // Steady = goal race pace 8400s / 60 / 16km = 8.75 min/km
    expect(result.steady.min).toBeCloseTo(8.75 * 0.98, 1);
    expect(result.steady.max).toBeCloseTo(8.75 * 1.01, 1);
    // Easy/tempo still derived from 10K ability
    expect(result.easy.min).toBeLessThan(result.steady.min);
  });

  it("steady uses ability pace when no goal is provided", () => {
    const result = getPaceTable(10, 3300);
    const abilityPace = 3300 / 60 / 10; // 5.5 min/km
    expect(result.steady.min).toBeCloseTo(abilityPace * 0.98, 1);
    expect(result.steady.max).toBeCloseTo(abilityPace * 1.01, 1);
  });

  it("stores ability context in result", () => {
    const result = getPaceTable(10, 3300, 16, 8400);
    expect(result.abilitySecs).toBe(3300);
    expect(result.abilityDistKm).toBe(10);
  });

  it("throws on zero or negative distance", () => {
    expect(() => getPaceTable(0, 3300)).toThrow("positive");
    expect(() => getPaceTable(-5, 3300)).toThrow("positive");
  });

  it("throws on zero or negative time", () => {
    expect(() => getPaceTable(10, 0)).toThrow("positive");
    expect(() => getPaceTable(10, -100)).toThrow("positive");
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
    abilitySecs: 8400,
    abilityDistKm: 21.0975,
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

describe("getDefaultGoalTime", () => {
  it("returns beginner HM default", () => {
    expect(getDefaultGoalTime(21.0975, "beginner")).toBe(9000);
  });
  it("returns intermediate HM default", () => {
    expect(getDefaultGoalTime(21.0975, "intermediate")).toBe(7500);
  });
  it("returns experienced HM default", () => {
    expect(getDefaultGoalTime(21.0975, "experienced")).toBe(6300);
  });
  it("returns intermediate 5K default", () => {
    expect(getDefaultGoalTime(5, "intermediate")).toBe(1620);
  });
  it("returns intermediate 10K default", () => {
    expect(getDefaultGoalTime(10, "intermediate")).toBe(3360);
  });
  it("returns intermediate marathon default", () => {
    expect(getDefaultGoalTime(42.195, "intermediate")).toBe(15300);
  });
  it("interpolates for custom distances", () => {
    const time = getDefaultGoalTime(16, "intermediate");
    expect(time).toBeGreaterThan(3360);
    expect(time).toBeLessThan(7500);
  });
});

describe("getSliderRange", () => {
  it("returns 5K range", () => {
    expect(getSliderRange(5)).toEqual({ min: 900, max: 2700, step: 60 });
  });
  it("returns HM range", () => {
    expect(getSliderRange(21.0975)).toEqual({ min: 4800, max: 11700, step: 300 });
  });
  it("returns marathon range", () => {
    expect(getSliderRange(42.195)).toEqual({ min: 9900, max: 23400, step: 300 });
  });
  it("uses nearest standard range for custom distances", () => {
    expect(getSliderRange(16)).toEqual({ min: 4800, max: 11700, step: 300 });
  });
});
