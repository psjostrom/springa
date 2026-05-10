import { describe, it, expect } from "vitest";
import { findMatchingRuns, type MatchableRun, type MatchTarget } from "../matchingRuns";

const mk = (over: Partial<MatchableRun>): MatchableRun => ({
  activityId: "a",
  date: "2026-04-01",
  category: "interval",
  startBG: 8.5,
  entrySlope: 0,
  fuelRate: 60,
  hourOfDay: 7,
  recentLoad: 50,
  endBG: 7.0,
  wentHypo: false,
  ...over,
});

const target: MatchTarget = {
  category: "interval",
  startBG: 8.5,
  fuelRate: 60,
  hourOfDay: 7,
  recentLoad: 50,
};

describe("findMatchingRuns", () => {
  it("hard-filters by category", () => {
    const history = [
      mk({ category: "interval", date: "2026-04-30", activityId: "a1" }),
      mk({ category: "easy",     date: "2026-04-29", activityId: "a2" }),
      mk({ category: "long",     date: "2026-04-28", activityId: "a3" }),
    ];
    const result = findMatchingRuns(target, history);
    expect(result.matches.every((m) => m.category === "interval")).toBe(true);
  });

  it("returns up to 10 most recent matches", () => {
    const history = Array.from({ length: 15 }, (_, i) =>
      mk({
        category: "interval",
        date: `2026-04-${String(i + 1).padStart(2, "0")}`,
        activityId: `a${i}`,
      }),
    );
    const result = findMatchingRuns(target, history);
    expect(result.matches.length).toBe(10);
    expect(result.matches[0].activityId).toBe("a14");
  });

  it("relaxes soft filter when fewer than 4 matches pass", () => {
    // Build 12+ runs with high startBG correlation to wentHypo so startBG ranks high enough to be picked.
    // Then set 3 of 4 with startBG far from target -> they fail strict filter.
    // startBG window is ±2.0, so target=8.5 passes [6.5, 10.5]. We need runs outside this range.
    const baseline = Array.from({ length: 11 }, (_, i) =>
      mk({
        category: "interval",
        date: `2026-03-${String(i + 1).padStart(2, "0")}`,
        activityId: `b${i}`,
        startBG: 11 + i * 0.5,  // 11, 11.5, 12, ..., 16 — all outside [6.5, 10.5]
        wentHypo: i < 5,
      }),
    );
    const recent = [
      mk({ category: "interval", date: "2026-04-30", activityId: "r1", startBG: 8.5 }),
      mk({ category: "interval", date: "2026-04-29", activityId: "r2", startBG: 14.0 }),
      mk({ category: "interval", date: "2026-04-28", activityId: "r3", startBG: 13.5 }),
      mk({ category: "interval", date: "2026-04-27", activityId: "r4", startBG: 13.0 }),
    ];
    const result = findMatchingRuns(target, [...baseline, ...recent]);
    // After relaxing, all category matches should be returned
    expect(result.matches.length).toBeGreaterThanOrEqual(4);
    expect(result.relaxed).toBe(true);
  });

  it("returns empty matches with no error when zero category matches exist", () => {
    const result = findMatchingRuns(target, []);
    expect(result.matches).toEqual([]);
    expect(result.usedPredictors).toEqual([]);
    expect(result.relaxed).toBe(false);
  });

  it("does not soft-filter when no predictor reaches sampleCount >= 10", () => {
    // 5 runs in category — no predictor scores will pass the >= 10 threshold,
    // so no soft filtering. All 5 should pass.
    const history = Array.from({ length: 5 }, (_, i) =>
      mk({ category: "interval", date: `2026-04-${i + 1}`, activityId: `s${i}`, startBG: 5 + i * 2 }),
    );
    const result = findMatchingRuns(target, history);
    expect(result.matches.length).toBe(5);
    expect(result.usedPredictors).toEqual([]);
  });
});
