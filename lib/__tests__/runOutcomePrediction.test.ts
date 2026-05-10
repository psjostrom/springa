import { describe, it, expect } from "vitest";
import { predictRunOutcome, type MatchableRunWithPost } from "../runOutcomePrediction";

const mk = (
  endBG: number,
  peak60: number,
  postHypo = false,
): MatchableRunWithPost => ({
  activityId: `a-${endBG}`,
  date: "2026-04-01",
  category: "interval",
  startBG: 8,
  entrySlope: null,
  fuelRate: 60,
  hourOfDay: 7,
  endBG,
  wentHypo: endBG < 4.0,
  peak60mAboveEnd: peak60,
  postRunHypo: postHypo,
});

describe("predictRunOutcome", () => {
  it("returns null when matches empty", () => {
    expect(predictRunOutcome([])).toBeNull();
  });

  it("computes during medians and percentiles", () => {
    const matches = [mk(4.5, 1), mk(5.0, 2), mk(6.0, 3), mk(7.0, 4), mk(8.0, 5)];
    const out = predictRunOutcome(matches)!;
    expect(out.during.medianEndBG).toBe(6.0);
    expect(out.during.p10EndBG).toBeCloseTo(4.7, 1);
    expect(out.during.p90EndBG).toBeCloseTo(7.6, 1);
    expect(out.during.matchCount).toBe(5);
    expect(out.during.confidence).toBe("medium");
  });

  it("counts hypos", () => {
    const matches = [mk(3.8, 0), mk(5.0, 1), mk(3.5, 2)];
    const out = predictRunOutcome(matches)!;
    expect(out.during.hypoCount).toBe(2);
  });

  it("computes after rebound stats including bigReboundCount", () => {
    const matches = [mk(5, 1), mk(5, 3), mk(5, 5)];
    const out = predictRunOutcome(matches)!;
    expect(out.after.medianRebound).toBe(3);
    expect(out.after.medianPeakBG).toBe(8);        // quantile([6, 8, 10], 0.5)
    expect(out.after.p10PeakBG).toBeCloseTo(6.4, 1); // quantile([6, 8, 10], 0.1)
    expect(out.after.p90PeakBG).toBeCloseTo(9.6, 1); // quantile([6, 8, 10], 0.9)
    expect(out.after.bigReboundCount).toBe(2);     // peak60 > 2.0 → only the rows with 3 and 5
  });

  it("counts late hypos", () => {
    const matches = [mk(5, 1, true), mk(5, 2, false), mk(5, 3, true)];
    const out = predictRunOutcome(matches)!;
    expect(out.after.lateHypoCount).toBe(2);
  });

  it("classifies confidence", () => {
    expect(predictRunOutcome([mk(5, 1), mk(5, 1), mk(5, 1)])!.during.confidence).toBe("low");
    expect(predictRunOutcome(Array.from({ length: 6 }, () => mk(5, 1)))!.during.confidence).toBe("medium");
    expect(predictRunOutcome(Array.from({ length: 12 }, () => mk(5, 1)))!.during.confidence).toBe("high");
  });
});
