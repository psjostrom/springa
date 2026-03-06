import { describe, it, expect } from "vitest";
import {
  computeStats,
  zScoreToScore,
  tsbToScore,
  computeReadiness,
} from "../readiness";

describe("computeStats", () => {
  it("returns zero for empty array", () => {
    const result = computeStats([]);
    expect(result.mean).toBe(0);
    expect(result.sd).toBe(0);
  });

  it("computes correct mean", () => {
    const result = computeStats([10, 20, 30]);
    expect(result.mean).toBe(20);
  });

  it("computes correct standard deviation", () => {
    // [10, 20, 30] -> mean 20, variance (100+0+100)/3 = 66.67, sd = 8.16
    const result = computeStats([10, 20, 30]);
    expect(result.sd).toBeCloseTo(8.165, 2);
  });

  it("returns zero sd for single value", () => {
    const result = computeStats([50]);
    expect(result.mean).toBe(50);
    expect(result.sd).toBe(0);
  });

  it("returns zero sd for identical values", () => {
    const result = computeStats([42, 42, 42, 42]);
    expect(result.mean).toBe(42);
    expect(result.sd).toBe(0);
  });
});

describe("zScoreToScore", () => {
  it("returns 50 when value equals mean", () => {
    expect(zScoreToScore(100, 100, 10)).toBe(50);
  });

  it("returns 50 when sd is zero", () => {
    expect(zScoreToScore(150, 100, 0)).toBe(50);
  });

  it("returns higher score for values above mean", () => {
    // z = (120 - 100) / 10 = 2 -> score = 50 + 2*25 = 100
    expect(zScoreToScore(120, 100, 10)).toBe(100);
  });

  it("returns lower score for values below mean", () => {
    // z = (80 - 100) / 10 = -2 -> score = 50 - 2*25 = 0
    expect(zScoreToScore(80, 100, 10)).toBe(0);
  });

  it("clamps to 0-100 range", () => {
    // Very high value
    expect(zScoreToScore(200, 100, 10)).toBe(100);
    // Very low value
    expect(zScoreToScore(0, 100, 10)).toBe(0);
  });

  it("inverts score when invert flag is true", () => {
    // For RHR where lower is better
    // z = (120 - 100) / 10 = 2, inverted -> -2 -> score = 0
    expect(zScoreToScore(120, 100, 10, true)).toBe(0);
    // z = (80 - 100) / 10 = -2, inverted -> 2 -> score = 100
    expect(zScoreToScore(80, 100, 10, true)).toBe(100);
  });
});

describe("tsbToScore", () => {
  it("returns 0 for TSB <= -30", () => {
    expect(tsbToScore(-30)).toBe(0);
    expect(tsbToScore(-50)).toBe(0);
  });

  it("returns 100 for TSB >= 15", () => {
    expect(tsbToScore(15)).toBe(100);
    expect(tsbToScore(25)).toBe(100);
  });

  it("interpolates linearly between -30 and +15", () => {
    // TSB 0 -> (0+30)/45 * 100 = 66.67
    expect(tsbToScore(0)).toBeCloseTo(66.67, 1);
    // TSB -15 -> (-15+30)/45 * 100 = 33.33
    expect(tsbToScore(-15)).toBeCloseTo(33.33, 1);
  });
});

describe("computeReadiness", () => {
  const hrvBaseline = { mean: 50, sd: 10 };
  const rhrBaseline = { mean: 55, sd: 5 };

  it("returns null when no metrics are available", () => {
    const result = computeReadiness(null, hrvBaseline, null, rhrBaseline, null, null);
    expect(result).toBeNull();
  });

  it("returns null when baselines have zero mean", () => {
    const result = computeReadiness(
      50,
      { mean: 0, sd: 0 },
      55,
      { mean: 0, sd: 0 },
      null,
      null
    );
    expect(result).toBeNull();
  });

  it("computes score from HRV alone", () => {
    // HRV 50 with mean 50, sd 10 -> z=0 -> score=50
    const result = computeReadiness(50, hrvBaseline, null, rhrBaseline, null, null);
    expect(result).toBe(50);
  });

  it("computes score from RHR alone (inverted)", () => {
    // RHR 55 with mean 55, sd 5 -> z=0 -> score=50
    const result = computeReadiness(null, hrvBaseline, 55, rhrBaseline, null, null);
    expect(result).toBe(50);
  });

  it("treats sleep > 12 as a score", () => {
    // Sleep score 80 -> used directly with weight 25
    const result = computeReadiness(null, hrvBaseline, null, rhrBaseline, 80, null);
    expect(result).toBe(80);
  });

  it("converts sleep hours to score", () => {
    // Sleep 7 hours -> (7-4)/5 * 100 = 60
    const result = computeReadiness(null, hrvBaseline, null, rhrBaseline, 7, null);
    expect(result).toBe(60);
  });

  it("clamps sleep hours score to 0-100", () => {
    // Sleep 2 hours -> (2-4)/5 * 100 = -40 -> clamped to 0
    const result = computeReadiness(null, hrvBaseline, null, rhrBaseline, 2, null);
    expect(result).toBe(0);
    // Sleep 12 hours -> (12-4)/5 * 100 = 160 -> clamped to 100
    // But 12 > 12 is false, so treated as hours: (12-4)/5*100 = 160 -> 100
    const result2 = computeReadiness(null, hrvBaseline, null, rhrBaseline, 12, null);
    expect(result2).toBe(100);
  });

  it("includes TSB in weighted average", () => {
    // TSB 0 -> tsbToScore(0) ≈ 66.67
    const result = computeReadiness(null, hrvBaseline, null, rhrBaseline, null, 0);
    expect(result).toBeCloseTo(67, 0);
  });

  it("computes weighted average of all metrics", () => {
    // HRV 50 -> z=0 -> 50, weight 30
    // RHR 55 -> z=0 (inverted) -> 50, weight 20
    // Sleep 75 (score) -> 75, weight 25
    // TSB 0 -> 66.67, weight 25
    // Weighted: (50*30 + 50*20 + 75*25 + 66.67*25) / 100 = 60.42
    const result = computeReadiness(50, hrvBaseline, 55, rhrBaseline, 75, 0);
    expect(result).toBeCloseTo(60, 0);
  });

  it("handles excellent metrics", () => {
    // HRV 70 -> z=2 -> 100
    // RHR 45 -> z=-2 (inverted=2) -> 100
    // Sleep score 95 -> 95
    // TSB +10 -> ~89
    // Should be high readiness
    const result = computeReadiness(70, hrvBaseline, 45, rhrBaseline, 95, 10);
    expect(result).toBeGreaterThan(90);
  });

  it("handles poor metrics", () => {
    // HRV 30 -> z=-2 -> 0
    // RHR 65 -> z=2 (inverted=-2) -> 0
    // Sleep 4 hours -> 0
    // TSB -25 -> ~11
    // Should be low readiness
    const result = computeReadiness(30, hrvBaseline, 65, rhrBaseline, 4, -25);
    expect(result).toBeLessThan(20);
  });
});
