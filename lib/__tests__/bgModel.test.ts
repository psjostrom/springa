import { describe, it, expect } from "vitest";
import {
  buildBGModelFromCached,
  suggestFuelAdjustments,
  classifyBGBand,
  analyzeBGByStartLevel,
  classifyTimeBucket,
  analyzeBGByTime,
  calculateTargetFuelRates,
  computeEntrySlope,
  classifyEntrySlope,
  analyzeBGByEntrySlope,
  type BGObservation,
} from "../bgModel";
import { extractObservations } from "../bgObservations";
import { linearRegression } from "../math";
import type { EnrichedActivity } from "../activityStreamsDb";
import type { DataPoint } from "../types";
import type { PostRunSpikeData } from "../postRunSpike";

// Helper: create a BGObservation for unit tests
function makeObs(overrides: Partial<BGObservation> = {}): BGObservation {
  return {
    category: "easy",
    bgRate: -0.5,
    fuelRate: 48,
    activityId: "a1",
    timeMinute: 10,
    startBG: 10,
    relativeMinute: 10,
    entrySlope: null,
    ...overrides,
  };
}

describe("extractObservations", () => {
  it("returns empty for insufficient data", () => {
    const result = extractObservations([], [], "a1", 48, 10, "easy");
    expect(result).toHaveLength(0);
  });

  it("skips first 5 and last 2 minutes", () => {
    // 15 minutes of data
    const hr: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
      time: i,
      value: 125,
    }));
    const glucose: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
      time: i,
      value: 10 - i * 0.2,
    }));

    const obs = extractObservations(hr, glucose, "a1", 48, 10, "easy");

    // First observation should start at minute 5 (skip first 5)
    // Last window should end before minute 13 (15 - 2)
    for (const o of obs) {
      expect(o.timeMinute).toBeGreaterThanOrEqual(5);
      expect(o.timeMinute).toBeLessThanOrEqual(15 - 2 - 5); // endTime - WINDOW_SIZE
    }
  });

  it("calculates BG rate correctly for linear drop", () => {
    // 20 minutes, BG drops from 10 to 8 (linear, -0.1/min)
    const hr: DataPoint[] = Array.from({ length: 20 }, (_, i) => ({
      time: i,
      value: 125,
    }));
    const glucose: DataPoint[] = Array.from({ length: 20 }, (_, i) => ({
      time: i,
      value: 10 - i * 0.1,
    }));

    const obs = extractObservations(hr, glucose, "a1", 48, 10, "easy");
    expect(obs.length).toBeGreaterThan(0);

    // Each 5-min window: -0.1/min * 5min = -0.5 mmol/L total drop over 5min
    for (const o of obs) {
      expect(o.bgRate).toBeCloseTo(-0.5, 0);
    }
  });

  it("assigns category from parameter", () => {
    const hr: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
      time: i,
      value: 125,
    }));
    const glucose: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
      time: i,
      value: 10,
    }));

    const easyObs = extractObservations(hr, glucose, "a1", 48, 10, "easy");
    expect(easyObs[0].category).toBe("easy");

    const longObs = extractObservations(hr, glucose, "a1", 60, 10, "long");
    expect(longObs[0].category).toBe("long");

    const intervalObs = extractObservations(hr, glucose, "a1", 30, 10, "interval");
    expect(intervalObs[0].category).toBe("interval");
  });

  it("stores activityId and fuelRate on observations", () => {
    const hr: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
      time: i,
      value: 125,
    }));
    const glucose: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
      time: i,
      value: 10,
    }));

    const obs = extractObservations(hr, glucose, "run-42", 60, 10, "easy");
    expect(obs[0].activityId).toBe("run-42");
    expect(obs[0].fuelRate).toBe(60);
  });

  it("stores startBG and relativeMinute on observations", () => {
    const hr: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
      time: i,
      value: 125,
    }));
    const glucose: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
      time: i,
      value: 11 - i * 0.1,
    }));

    const obs = extractObservations(hr, glucose, "a1", 48, 11, "easy");
    expect(obs[0].startBG).toBe(11);
    // First obs starts at minute 5 (SKIP_START), hr[0].time = 0, so relativeMinute = 5
    expect(obs[0].relativeMinute).toBe(5);
  });
});

describe("suggestFuelAdjustments", () => {
  // Helper for this describe block
  function makeCachedForFuel(
    activityId: string,
    fuelRate: number,
    glucoseFn: (i: number) => number,
  ): EnrichedActivity {
    return {
      activityId,
      category: "easy",
      fuelRate,
      glucose: Array.from({ length: 20 }, (_, i) => ({ time: i, value: glucoseFn(i) })),
      hr: Array.from({ length: 20 }, (_, i) => ({ time: i, value: 125 })),
    };
  }

  it("returns empty for stable BG", () => {
    const model = buildBGModelFromCached([
      makeCachedForFuel("a1", 48, () => 8.0), // flat BG
    ]);

    const suggestions = suggestFuelAdjustments(model);
    expect(suggestions).toHaveLength(0);
  });

  it("suggests fuel increase for fast-dropping BG", () => {
    // BG drops from 10 to 4 over 20 minutes (-0.3/min → -1.5 total over 5min)
    const model = buildBGModelFromCached([
      makeCachedForFuel("a1", 48, (i) => 10 - i * 0.3),
    ]);

    const suggestions = suggestFuelAdjustments(model);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].category).toBe("easy");
    expect(suggestions[0].suggestedIncrease).toBeGreaterThan(0);
    expect(suggestions[0].avgDropRate).toBeLessThan(-0.5);
  });

  it("does not suggest for moderate drops (> -0.5)", () => {
    // BG drops mildly: -0.04/min → -0.2 total over 5min
    const model = buildBGModelFromCached([
      makeCachedForFuel("a1", 48, (i) => 10 - i * 0.04),
    ]);

    const suggestions = suggestFuelAdjustments(model);
    expect(suggestions).toHaveLength(0);
  });

  it("scales fuel increase proportionally to excess drop", () => {
    // Very fast drop: -0.5/min → -2.5 total over 5min
    const model = buildBGModelFromCached([
      makeCachedForFuel("a1", 48, (i) => 10 - i * 0.5),
    ]);

    const suggestions = suggestFuelAdjustments(model);
    expect(suggestions.length).toBeGreaterThan(0);
    // Drop rate ~-2.5 per 5min, excess = 2.0, increase = ceil(2.0/0.25)*6 = 48
    // But window edge effects may reduce the observed rate slightly
    expect(suggestions[0].suggestedIncrease).toBeGreaterThanOrEqual(30);
    expect(suggestions[0].suggestedIncrease).toBeLessThanOrEqual(60);
  });
});

describe("classifyBGBand", () => {
  it("classifies < 8 mmol/L", () => {
    expect(classifyBGBand(5)).toBe("<8");
    expect(classifyBGBand(7.9)).toBe("<8");
  });

  it("classifies boundary at 8", () => {
    expect(classifyBGBand(8)).toBe("8-10");
  });

  it("classifies 8-10 range", () => {
    expect(classifyBGBand(9)).toBe("8-10");
    expect(classifyBGBand(9.9)).toBe("8-10");
  });

  it("classifies boundary at 10", () => {
    expect(classifyBGBand(10)).toBe("10-12");
  });

  it("classifies 10-12 range", () => {
    expect(classifyBGBand(11)).toBe("10-12");
    expect(classifyBGBand(11.9)).toBe("10-12");
  });

  it("classifies boundary at 12", () => {
    expect(classifyBGBand(12)).toBe("12+");
  });

  it("classifies > 12 mmol/L", () => {
    expect(classifyBGBand(15)).toBe("12+");
  });
});

describe("analyzeBGByStartLevel", () => {
  it("returns empty for no observations", () => {
    expect(analyzeBGByStartLevel([])).toHaveLength(0);
  });

  it("groups observations by start BG band", () => {
    const obs: BGObservation[] = [
      makeObs({ startBG: 7, bgRate: -1.0, activityId: "a1" }),
      makeObs({ startBG: 9, bgRate: -0.5, activityId: "a2" }),
      makeObs({ startBG: 11, bgRate: -0.25, activityId: "a3" }),
      makeObs({ startBG: 13, bgRate: 0.0, activityId: "a4" }),
    ];

    const result = analyzeBGByStartLevel(obs);
    expect(result).toHaveLength(4);
    expect(result[0].band).toBe("<8");
    expect(result[1].band).toBe("8-10");
    expect(result[2].band).toBe("10-12");
    expect(result[3].band).toBe("12+");
  });

  it("computes avg and median rate per band", () => {
    const obs: BGObservation[] = [
      makeObs({ startBG: 9, bgRate: -0.5, activityId: "a1" }),
      makeObs({ startBG: 9.5, bgRate: -1.0, activityId: "a2" }),
      makeObs({ startBG: 8.5, bgRate: -1.5, activityId: "a3" }),
    ];

    const result = analyzeBGByStartLevel(obs);
    expect(result).toHaveLength(1);
    expect(result[0].band).toBe("8-10");
    expect(result[0].avgRate).toBeCloseTo(-1.0);
    expect(result[0].medianRate).toBeCloseTo(-1.0);
    expect(result[0].sampleCount).toBe(3);
  });

  it("counts distinct activities per band", () => {
    const obs: BGObservation[] = [
      makeObs({ startBG: 9, activityId: "a1" }),
      makeObs({ startBG: 9, activityId: "a1" }),
      makeObs({ startBG: 9, activityId: "a2" }),
    ];

    const result = analyzeBGByStartLevel(obs);
    expect(result[0].activityCount).toBe(2);
  });
});

describe("computeEntrySlope", () => {
  it("returns null for empty glucose array", () => {
    expect(computeEntrySlope([])).toBeNull();
  });

  it("returns null for single point", () => {
    expect(computeEntrySlope([{ time: 0, value: 10 }])).toBeNull();
  });

  it("returns null when all points are at time >= 5", () => {
    const glucose = [
      { time: 5, value: 10 },
      { time: 6, value: 9.5 },
    ];
    expect(computeEntrySlope(glucose)).toBeNull();
  });

  it("computes dropping slope", () => {
    // BG drops from 10 to 9 over 4 minutes → -0.25/min → -1.25 total over 5min
    const glucose = [
      { time: 0, value: 10 },
      { time: 1, value: 9.75 },
      { time: 2, value: 9.5 },
      { time: 3, value: 9.25 },
      { time: 4, value: 9.0 },
    ];
    expect(computeEntrySlope(glucose)).toBeCloseTo(-1.25);
  });

  it("computes rising slope", () => {
    // BG rises from 8 to 9 over 4 minutes → +0.25/min → +1.25 total over 5min
    const glucose = [
      { time: 0, value: 8 },
      { time: 4, value: 9 },
    ];
    expect(computeEntrySlope(glucose)).toBeCloseTo(1.25);
  });

  it("computes stable slope", () => {
    const glucose = [
      { time: 0, value: 10 },
      { time: 4, value: 10.1 },
    ];
    const slope = computeEntrySlope(glucose)!;
    expect(Math.abs(slope)).toBeLessThan(0.15);
  });

  it("ignores points at time >= 5", () => {
    const glucose = [
      { time: 0, value: 10 },
      { time: 3, value: 9.4 },
      { time: 5, value: 5.0 }, // should be ignored
      { time: 10, value: 3.0 }, // should be ignored
    ];
    // Only uses time 0 and 3: (9.4 - 10) / 3 * 5 = -1.0 total over 5min
    expect(computeEntrySlope(glucose)).toBeCloseTo(-1.0);
  });
});

describe("classifyEntrySlope", () => {
  it("classifies < -0.5 as crashing", () => {
    expect(classifyEntrySlope(-0.75)).toBe("crashing");
    expect(classifyEntrySlope(-1.0)).toBe("crashing");
  });

  it("classifies boundary at -0.5 as dropping", () => {
    expect(classifyEntrySlope(-0.5)).toBe("dropping");
  });

  it("classifies -0.5 to -0.15 as dropping", () => {
    expect(classifyEntrySlope(-0.25)).toBe("dropping");
    expect(classifyEntrySlope(-0.16)).toBe("dropping");
  });

  it("classifies boundary at -0.15 as stable", () => {
    expect(classifyEntrySlope(-0.149)).toBe("stable");
  });

  it("classifies -0.15 to +0.15 as stable", () => {
    expect(classifyEntrySlope(0)).toBe("stable");
    expect(classifyEntrySlope(0.1)).toBe("stable");
    expect(classifyEntrySlope(0.149)).toBe("stable");
  });

  it("classifies > +0.15 as rising", () => {
    expect(classifyEntrySlope(0.16)).toBe("rising");
    expect(classifyEntrySlope(0.5)).toBe("rising");
  });
});

describe("analyzeBGByEntrySlope", () => {
  it("returns empty for no observations", () => {
    expect(analyzeBGByEntrySlope([])).toHaveLength(0);
  });

  it("returns empty when all entrySlopes are null", () => {
    const obs = [
      makeObs({ entrySlope: null }),
      makeObs({ entrySlope: null }),
    ];
    expect(analyzeBGByEntrySlope(obs)).toHaveLength(0);
  });

  it("groups observations by entry slope band", () => {
    const obs = [
      makeObs({ entrySlope: -0.75, bgRate: -1.0, activityId: "a1" }),
      makeObs({ entrySlope: -0.25, bgRate: -0.5, activityId: "a2" }),
      makeObs({ entrySlope: 0.0, bgRate: -0.25, activityId: "a3" }),
      makeObs({ entrySlope: 0.25, bgRate: 0.0, activityId: "a4" }),
    ];

    const result = analyzeBGByEntrySlope(obs);
    expect(result).toHaveLength(4);
    expect(result[0].slope).toBe("crashing");
    expect(result[1].slope).toBe("dropping");
    expect(result[2].slope).toBe("stable");
    expect(result[3].slope).toBe("rising");
  });

  it("computes avg and median rate per slope band", () => {
    const obs = [
      makeObs({ entrySlope: 0.0, bgRate: -0.5, activityId: "a1" }),
      makeObs({ entrySlope: 0.1, bgRate: -1.0, activityId: "a2" }),
      makeObs({ entrySlope: -0.1, bgRate: -1.5, activityId: "a3" }),
    ];

    const result = analyzeBGByEntrySlope(obs);
    expect(result).toHaveLength(1);
    expect(result[0].slope).toBe("stable");
    expect(result[0].avgRate).toBeCloseTo(-1.0);
    expect(result[0].medianRate).toBeCloseTo(-1.0);
    expect(result[0].sampleCount).toBe(3);
  });

  it("counts distinct activities per slope band", () => {
    const obs = [
      makeObs({ entrySlope: 0.0, activityId: "a1" }),
      makeObs({ entrySlope: 0.0, activityId: "a1" }),
      makeObs({ entrySlope: 0.1, activityId: "a2" }),
    ];

    const result = analyzeBGByEntrySlope(obs);
    expect(result[0].activityCount).toBe(2);
  });
});

describe("classifyTimeBucket", () => {
  it("classifies 0-14 as 0-15", () => {
    expect(classifyTimeBucket(0)).toBe("0-15");
    expect(classifyTimeBucket(14)).toBe("0-15");
  });

  it("classifies boundary at 15", () => {
    expect(classifyTimeBucket(15)).toBe("15-30");
  });

  it("classifies 15-29 as 15-30", () => {
    expect(classifyTimeBucket(20)).toBe("15-30");
    expect(classifyTimeBucket(29)).toBe("15-30");
  });

  it("classifies boundary at 30", () => {
    expect(classifyTimeBucket(30)).toBe("30-45");
  });

  it("classifies boundary at 45", () => {
    expect(classifyTimeBucket(45)).toBe("45+");
  });

  it("classifies > 45 as 45+", () => {
    expect(classifyTimeBucket(60)).toBe("45+");
  });
});

describe("analyzeBGByTime", () => {
  it("returns empty for no observations", () => {
    expect(analyzeBGByTime([])).toHaveLength(0);
  });

  it("groups observations into time buckets", () => {
    const obs: BGObservation[] = [
      makeObs({ relativeMinute: 5, bgRate: -0.5 }),
      makeObs({ relativeMinute: 20, bgRate: -1.0 }),
      makeObs({ relativeMinute: 35, bgRate: -1.5 }),
      makeObs({ relativeMinute: 50, bgRate: -2.0 }),
    ];

    const result = analyzeBGByTime(obs);
    expect(result).toHaveLength(4);
    expect(result[0].bucket).toBe("0-15");
    expect(result[0].avgRate).toBeCloseTo(-0.5);
    expect(result[3].bucket).toBe("45+");
    expect(result[3].avgRate).toBeCloseTo(-2.0);
  });

  it("filters by category when provided", () => {
    const obs: BGObservation[] = [
      makeObs({ category: "easy", relativeMinute: 5, bgRate: -0.5 }),
      makeObs({ category: "interval", relativeMinute: 5, bgRate: -1.5 }),
      makeObs({ category: "easy", relativeMinute: 20, bgRate: -1.0 }),
    ];

    const result = analyzeBGByTime(obs, "easy");
    expect(result).toHaveLength(2);
    // All results should only contain easy category data
    expect(result[0].avgRate).toBeCloseTo(-0.5);
    expect(result[1].avgRate).toBeCloseTo(-1.0);
  });

  it("returns empty when category filter matches nothing", () => {
    const obs: BGObservation[] = [
      makeObs({ category: "easy", relativeMinute: 5 }),
    ];
    expect(analyzeBGByTime(obs, "interval")).toHaveLength(0);
  });
});

describe("linearRegression", () => {
  it("returns zeros for less than 2 points", () => {
    const result = linearRegression([{ x: 1, y: 2 }]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(0);
  });

  it("computes perfect fit for two points", () => {
    const result = linearRegression([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
    ]);
    expect(result.slope).toBeCloseTo(2);
    expect(result.intercept).toBeCloseTo(0);
  });

  it("computes perfect fit for collinear points", () => {
    // y = 3x + 1
    const result = linearRegression([
      { x: 0, y: 1 },
      { x: 1, y: 4 },
      { x: 2, y: 7 },
      { x: 3, y: 10 },
    ]);
    expect(result.slope).toBeCloseTo(3);
    expect(result.intercept).toBeCloseTo(1);
  });

  it("handles noisy data", () => {
    const result = linearRegression([
      { x: 1, y: 2 },
      { x: 2, y: 5 },
      { x: 3, y: 4 },
      { x: 4, y: 8 },
    ]);
    expect(result.slope).toBeGreaterThan(0);
  });
});

describe("calculateTargetFuelRates", () => {
  it("returns empty for stable BG (no drop)", () => {
    const obs: BGObservation[] = [
      makeObs({ bgRate: 0.5, fuelRate: 48 }),
      makeObs({ bgRate: 0.2, fuelRate: 48 }),
    ];
    expect(calculateTargetFuelRates(obs)).toHaveLength(0);
  });

  it("returns empty when all fuelRates are null", () => {
    const obs: BGObservation[] = [
      makeObs({ bgRate: -1.5, fuelRate: null }),
      makeObs({ bgRate: -1.0, fuelRate: null }),
    ];
    expect(calculateTargetFuelRates(obs)).toHaveLength(0);
  });

  it("uses extrapolation with single fuel rate", () => {
    const obs: BGObservation[] = Array.from({ length: 5 }, () =>
      makeObs({ bgRate: -0.5, fuelRate: 48 }),
    );

    const result = calculateTargetFuelRates(obs);
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("extrapolation");
    // excessDrop = abs(-0.5) - abs(-0.1) = 0.4, target = 48 + 0.4*12 = 52.8 → 53
    expect(result[0].targetFuelRate).toBe(53);
    expect(result[0].category).toBe("easy");
  });

  it("uses regression with 2+ distinct fuel rates with 3+ obs each", () => {
    const obs: BGObservation[] = [
      // Fuel 30 → high drop
      ...Array.from({ length: 3 }, () => makeObs({ bgRate: -1.0, fuelRate: 30 })),
      // Fuel 60 → low drop
      ...Array.from({ length: 3 }, () => makeObs({ bgRate: -0.25, fuelRate: 60 })),
    ];

    const result = calculateTargetFuelRates(obs);
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("regression");
    // slope = 0.025, intercept = -1.75
    // Solve for y = -0.1: x = (-0.1 - (-1.75)) / 0.025 = 66
    // Cap: min(66, avgFuel 45 * 1.5 = 67.5, 90) = 66
    expect(result[0].targetFuelRate).toBe(66);
  });

  it("clamps target fuel rate to >= 0", () => {
    // Drop exceeds threshold (-0.25) with zero fuel — extrapolation stays non-negative
    const obs: BGObservation[] = Array.from({ length: 5 }, () =>
      makeObs({ bgRate: -0.3, fuelRate: 0 }),
    );

    const result = calculateTargetFuelRates(obs);
    expect(result).toHaveLength(1);
    expect(result[0].targetFuelRate).toBeGreaterThanOrEqual(0);
  });

  it("excludes observations with null fuelRate", () => {
    const obs: BGObservation[] = [
      makeObs({ bgRate: -0.75, fuelRate: 48 }),
      makeObs({ bgRate: -0.75, fuelRate: 48 }),
      makeObs({ bgRate: -0.75, fuelRate: 48 }),
      makeObs({ bgRate: -0.75, fuelRate: null }), // should be excluded
    ];

    const result = calculateTargetFuelRates(obs);
    expect(result).toHaveLength(1);
    expect(result[0].currentAvgFuel).toBe(48);
  });
});

describe("calculateTargetFuelRates with spike penalty", () => {
  it("returns spikeAdjustment: null when no spike data provided", () => {
    const obs = Array.from({ length: 10 }, (_, i) =>
      makeObs({ bgRate: -0.4, fuelRate: 60, activityId: `a${i}` }),
    );
    const results = calculateTargetFuelRates(obs);
    for (const r of results) {
      expect(r.spikeAdjustment).toBeNull();
    }
  });

  it("applies no penalty when avg spike is below threshold", () => {
    const obs = Array.from({ length: 10 }, (_, i) =>
      makeObs({ bgRate: -0.4, fuelRate: 60, activityId: `a${i}` }),
    );
    const spikes: PostRunSpikeData[] = Array.from({ length: 6 }, (_, i) => ({
      activityId: `a${i}`,
      category: "easy" as const,
      fuelRate: 60,
      spike30m: 1.5, // below ACCEPTABLE_SPIKE (2.0)
    }));
    const results = calculateTargetFuelRates(obs, spikes);
    const easy = results.find((r) => r.category === "easy");
    expect(easy).toBeDefined();
    expect(easy!.spikeAdjustment).toBeNull();
  });

  it("reduces target when avg spike exceeds threshold", () => {
    const obs = Array.from({ length: 10 }, (_, i) =>
      makeObs({ bgRate: -0.4, fuelRate: 60, activityId: `a${i}` }),
    );
    const spikes: PostRunSpikeData[] = Array.from({ length: 6 }, (_, i) => ({
      activityId: `a${i}`,
      category: "easy" as const,
      fuelRate: 60,
      spike30m: 5.0, // 3.0 above ACCEPTABLE_SPIKE
    }));
    const results = calculateTargetFuelRates(obs, spikes);
    const easy = results.find((r) => r.category === "easy");
    expect(easy).toBeDefined();
    // SPIKE_PENALTY_FACTOR = 4, excess = 3.0, penalty = 12 g/h
    expect(easy!.spikeAdjustment).toBe(12);
    expect(easy!.targetFuelRate).toBeLessThan(60);
  });

  it("skips penalty when fewer than MIN_POST_RUN_OBS spikes", () => {
    const obs = Array.from({ length: 10 }, (_, i) =>
      makeObs({ bgRate: -0.4, fuelRate: 60, activityId: `a${i}` }),
    );
    const spikes: PostRunSpikeData[] = Array.from({ length: 3 }, (_, i) => ({
      activityId: `a${i}`,
      category: "easy" as const,
      fuelRate: 60,
      spike30m: 5.0,
    }));
    const results = calculateTargetFuelRates(obs, spikes);
    const easy = results.find((r) => r.category === "easy");
    expect(easy).toBeDefined();
    expect(easy!.spikeAdjustment).toBeNull();
  });

  it("uses per-group spike: no penalty when target group is below threshold", () => {
    const obs = Array.from({ length: 10 }, (_, i) =>
      makeObs({ bgRate: -0.4, fuelRate: 60, activityId: `a${i}` }),
    );
    // Old runs at 60 g/h spike badly, new runs at 45 g/h are fine
    const spikes: PostRunSpikeData[] = [
      ...Array.from({ length: 6 }, (_, i) => ({
        activityId: `old${i}`,
        category: "easy" as const,
        fuelRate: 60,
        spike30m: 5.0, // bad
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        activityId: `new${i}`,
        category: "easy" as const,
        fuelRate: 45,
        spike30m: 1.5, // acceptable
      })),
    ];
    // Target from extrapolation will be near 60 → closest group is 60 → penalty applies
    const results = calculateTargetFuelRates(obs, spikes);
    const easy = results.find((r) => r.category === "easy");
    expect(easy).toBeDefined();
    expect(easy!.spikeAdjustment).toBe(12); // 60 group avg 5.0, excess 3.0 * 4
  });

  it("converges: no penalty when target matches low-spike group", () => {
    // Mix of old 60 g/h obs and new 45 g/h obs
    const obs = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeObs({ bgRate: -0.4, fuelRate: 45, activityId: `new${i}` }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeObs({ bgRate: -0.8, fuelRate: 60, activityId: `old${i}` }),
      ),
    ];
    // 45 g/h runs don't spike, 60 g/h runs spike
    const spikes: PostRunSpikeData[] = [
      ...Array.from({ length: 6 }, (_, i) => ({
        activityId: `new${i}`,
        category: "easy" as const,
        fuelRate: 45,
        spike30m: 1.0,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        activityId: `old${i}`,
        category: "easy" as const,
        fuelRate: 60,
        spike30m: 5.0,
      })),
    ];
    const results = calculateTargetFuelRates(obs, spikes);
    const easy = results.find((r) => r.category === "easy");
    expect(easy).toBeDefined();
    // If target lands near 45, closest group is 45 → avg spike 1.0 → no penalty → converges
    if (easy!.targetFuelRate <= 52) {
      expect(easy!.spikeAdjustment).toBeNull();
    }
  });

  it("never reduces target below MIN_FUEL_RATE (20 g/h)", () => {
    const obs = Array.from({ length: 10 }, (_, i) =>
      makeObs({ bgRate: -0.4, fuelRate: 30, activityId: `a${i}` }),
    );
    const spikes: PostRunSpikeData[] = Array.from({ length: 6 }, (_, i) => ({
      activityId: `a${i}`,
      category: "easy" as const,
      fuelRate: 30,
      spike30m: 10.0, // massive spike — penalty would be 32 g/h
    }));
    const results = calculateTargetFuelRates(obs, spikes);
    const easy = results.find((r) => r.category === "easy");
    expect(easy).toBeDefined();
    expect(easy!.targetFuelRate).toBeGreaterThanOrEqual(20);
  });
});

describe("buildBGModelFromCached", () => {
  // Helper: build EnrichedActivity with minute-indexed data
  function makeCached(
    activityId: string,
    category: "easy" | "long" | "interval",
    fuelRate: number | null,
    minutes: number,
    glucoseFn: (i: number) => number,
  ): EnrichedActivity {
    return {
      activityId,
      category,
      fuelRate,
      glucose: Array.from({ length: minutes }, (_, i) => ({ time: i, value: glucoseFn(i) })),
      hr: Array.from({ length: minutes }, (_, i) => ({ time: i, value: 125 })),
    };
  }

  it("returns empty model with no input", () => {
    const model = buildBGModelFromCached([]);
    expect(model.activitiesAnalyzed).toBe(0);
    expect(model.observations).toHaveLength(0);
    expect(model.categories.easy).toBeNull();
  });

  it("produces correct model for single activity", () => {
    const cached = makeCached("a1", "easy", 48, 25, (i) => 10 - i * 0.1);
    const model = buildBGModelFromCached([cached]);

    expect(model.activitiesAnalyzed).toBe(1);
    expect(model.observations.length).toBeGreaterThan(0);
    expect(model.categories.easy).not.toBeNull();
    expect(model.categories.easy!.avgFuelRate).toBe(48);
  });

  it("produces correct model for multiple categories", () => {
    const model = buildBGModelFromCached([
      makeCached("a1", "easy", 48, 20, (i) => 10 - i * 0.1),
      makeCached("a2", "interval", 30, 20, (i) => 10 - i * 0.05),
    ]);

    expect(model.activitiesAnalyzed).toBe(2);
    expect(model.categories.easy).not.toBeNull();
    expect(model.categories.interval).not.toBeNull();
    expect(model.categories.easy!.avgFuelRate).toBe(48);
    expect(model.categories.interval!.avgFuelRate).toBe(30);
  });

  it("skips activities with too few HR points", () => {
    const cached: EnrichedActivity = {
      activityId: "short",
      category: "easy",
      fuelRate: 48,
      glucose: Array.from({ length: 5 }, (_, i) => ({ time: i, value: 10 })),
      hr: Array.from({ length: 5 }, (_, i) => ({ time: i, value: 125 })),
    };
    const model = buildBGModelFromCached([cached]);
    expect(model.activitiesAnalyzed).toBe(0);
  });

  it("handles null fuelRate correctly", () => {
    const cached = makeCached("a1", "easy", null, 20, () => 8);
    const model = buildBGModelFromCached([cached]);
    expect(model.categories.easy!.avgFuelRate).toBeNull();
  });

  it("prefers runBGContext entry slope over in-run computed slope", () => {
    const cached = makeCached("a1", "easy", 48, 20, (i) => 10 - i * 0.1);
    // Inject a runBGContext with a specific entry slope
    cached.runBGContext = {
      activityId: "a1",
      category: "easy",
      pre: { entrySlope30m: -0.4, entryStability: 0.3, startBG: 10, readingCount: 6 },
      post: null,
      totalBGImpact: null,
    };

    const model = buildBGModelFromCached([cached]);
    // All observations should use the runBGContext entry slope
    for (const obs of model.observations) {
      expect(obs.entrySlope).toBe(-0.4);
    }
  });

  it("falls back to computeEntrySlope when runBGContext is absent", () => {
    const cached = makeCached("a1", "easy", 48, 20, (i) => 10 - i * 0.1);
    // No runBGContext
    const model = buildBGModelFromCached([cached]);
    // Observations should still have an entry slope (computed from in-run data)
    const withSlope = model.observations.filter((o) => o.entrySlope != null);
    expect(withSlope.length).toBeGreaterThan(0);
  });

  it("falls back when runBGContext.pre is null", () => {
    const cached = makeCached("a1", "easy", 48, 20, (i) => 10 - i * 0.1);
    cached.runBGContext = {
      activityId: "a1",
      category: "easy",
      pre: null,
      post: null,
      totalBGImpact: null,
    };

    const model = buildBGModelFromCached([cached]);
    // Should fall back to computed entry slope, not null
    const withSlope = model.observations.filter((o) => o.entrySlope != null);
    expect(withSlope.length).toBeGreaterThan(0);
  });
});
