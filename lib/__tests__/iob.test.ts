import { describe, it, expect } from "vitest";
import { computeIOB } from "../iob";

function makeTreatment(minutesAgo: number, insulin: number | null) {
  return { ts: Date.now() - minutesAgo * 60 * 1000, insulin };
}

describe("computeIOB", () => {
  it("returns 0 for empty treatments", () => {
    expect(computeIOB([], Date.now(), 55)).toBe(0);
  });

  it("returns 0 when no treatments have insulin", () => {
    const treatments = [makeTreatment(10, null), makeTreatment(20, 0)];
    expect(computeIOB(treatments, Date.now(), 55)).toBe(0);
  });

  it("recent bolus has high IOB", () => {
    const treatments = [makeTreatment(5, 4.0)];
    const iob = computeIOB(treatments, Date.now(), 55);
    expect(iob).toBeGreaterThan(3.0);
    expect(iob).toBeLessThanOrEqual(4.0);
  });

  it("old bolus has near-zero IOB", () => {
    const treatments = [makeTreatment(250, 4.0)];
    const iob = computeIOB(treatments, Date.now(), 55);
    expect(iob).toBeLessThan(0.5);
  });

  it("sums IOB from multiple boluses", () => {
    const treatments = [makeTreatment(10, 2.0), makeTreatment(30, 3.0)];
    const iob = computeIOB(treatments, Date.now(), 55);
    const iobSingle1 = computeIOB([treatments[0]], Date.now(), 55);
    const iobSingle2 = computeIOB([treatments[1]], Date.now(), 55);
    expect(iob).toBeCloseTo(iobSingle1 + iobSingle2, 1);
  });

  it("ignores treatments outside lookback window", () => {
    // tau=55, lookback = 5*55 = 275 min
    const treatments = [makeTreatment(300, 10.0)];
    expect(computeIOB(treatments, Date.now(), 55)).toBe(0);
  });

  it("faster insulin (lower tau) decays quicker", () => {
    const treatments = [makeTreatment(60, 4.0)];
    const iobFiasp = computeIOB(treatments, Date.now(), 55);
    const iobNovorapid = computeIOB(treatments, Date.now(), 75);
    expect(iobNovorapid).toBeGreaterThan(iobFiasp);
  });

  it("rounds to 1 decimal place", () => {
    const treatments = [makeTreatment(30, 3.7)];
    const iob = computeIOB(treatments, Date.now(), 55);
    expect(iob).toBe(Math.round(iob * 10) / 10);
  });
});
