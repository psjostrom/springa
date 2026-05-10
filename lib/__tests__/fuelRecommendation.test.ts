import { describe, it, expect } from "vitest";
import { recommendFuelRate } from "../fuelRecommendation";
import type { MatchableRunWithPost } from "../runOutcomePrediction";

const at = (fuelRate: number, ends: number[]): MatchableRunWithPost[] =>
  ends.map((e, i) => ({
    activityId: `f${fuelRate}-${i}`,
    date: "2026-04-01",
    category: "interval",
    startBG: 8,
    entrySlope: null,
    fuelRate,
    hourOfDay: 7,
    recentLoad: 50,
    endBG: e,
    wentHypo: e < 4.0,
    peak60mAboveEnd: 1,
    postRunHypo: false,
  }));

describe("recommendFuelRate", () => {
  it("picks the lowest fuel rate whose p10 endBG ≥ 4.5", () => {
    const matches = [
      ...at(56, [3.8, 4.0, 4.2, 4.5]),       // p10 ≈ 3.85 — fails
      ...at(60, [4.5, 5.0, 5.5, 6.0]),       // p10 ≈ 4.55 — passes
      ...at(64, [5.5, 6.0, 6.5, 7.0]),       // also passes — but 60 is lower
    ];
    const rec = recommendFuelRate(matches, 4.5);
    expect(rec?.fuelRate).toBe(60);
    expect(rec?.basis).toBe("evidence");
  });

  it("returns highest tested rate with limited-evidence flag when no rate clears threshold", () => {
    const matches = [
      ...at(56, [3.0, 3.2, 3.5, 3.8]),
      ...at(60, [3.8, 4.0, 4.2, 4.4]),
    ];
    const rec = recommendFuelRate(matches, 4.5);
    expect(rec?.fuelRate).toBe(60);
    expect(rec?.basis).toBe("limited-evidence");
  });

  it("returns null when zero matches", () => {
    expect(recommendFuelRate([], 4.5)).toBeNull();
  });

  it("skips fuel rates with fewer than 3 samples", () => {
    const matches = [
      ...at(56, [5.0, 5.5]),                // only 2 — skipped
      ...at(60, [4.5, 5.0, 5.5, 6.0]),      // qualifies — passes
    ];
    const rec = recommendFuelRate(matches, 4.5);
    expect(rec?.fuelRate).toBe(60);
  });

  it("uses default safety floor of 4.5 when not specified", () => {
    const matches = at(60, [4.5, 5.0, 5.5, 6.0]);
    const rec = recommendFuelRate(matches);
    expect(rec?.fuelRate).toBe(60);
    expect(rec?.basis).toBe("evidence");
  });
});
