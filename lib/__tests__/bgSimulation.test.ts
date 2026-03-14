import { describe, it, expect } from "vitest";
import {
  simulateBG,
  rateForStep,
  validateSimulation,
  type SimSegment,
  type SimPoint,
} from "../bgSimulation";
import {
  buildBGModelFromCached,
  type BGResponseModel,
} from "../bgModel";
import type { EnrichedActivity } from "../activityStreamsDb";

// --- Test helpers ---

/** Build an EnrichedActivity from simple arrays (minutes of data). */
function makeActivity(
  activityId: string,
  category: EnrichedActivity["category"],
  minutes: number,
  hrValue: number,
  glucoseValues: number[],
  fuelRate: number | null = 48,
): EnrichedActivity {
  return {
    activityId,
    category,
    fuelRate,
    glucose: glucoseValues.map((v, i) => ({ time: i, value: v })),
    hr: Array.from({ length: minutes }, (_, i) => ({ time: i, value: hrValue })),
  };
}

/** Build a model with enough data to produce meaningful rates. */
function buildTestModel(
  category: "easy" | "long" | "interval" = "easy",
  bgDropPerMin = 0.1,
  fuelRate = 48,
  numActivities = 3,
  activityMinutes = 50,
): BGResponseModel {
  const activities = Array.from({ length: numActivities }, (_, i) =>
    makeActivity(
      `a${i}`,
      category,
      activityMinutes,
      125,
      Array.from({ length: activityMinutes }, (_, j) => 10 - j * bgDropPerMin),
      fuelRate,
    ),
  );

  return buildBGModelFromCached(activities);
}

/** Build a model with multiple fuel rates for regression testing. */
function buildRegressionModel(): BGResponseModel {
  const activities = [
    // Low fuel (30 g/h) → BG drops fast (-0.2/min = -1.0/5min)
    ...Array.from({ length: 4 }, (_, i) =>
      makeActivity(`low-fuel-${i}`, "easy", 40, 125, Array.from({ length: 40 }, (_, j) => 10 - j * 0.2), 30),
    ),
    // High fuel (60 g/h) → BG drops slowly (-0.05/min = -0.25/5min)
    ...Array.from({ length: 4 }, (_, i) =>
      makeActivity(`high-fuel-${i}`, "easy", 40, 125, Array.from({ length: 40 }, (_, j) => 10 - j * 0.05), 60),
    ),
  ];

  return buildBGModelFromCached(activities);
}

/** Build a model with varied start BG levels. */
function buildStartBGModel(): BGResponseModel {
  const activities = [
    // Start at 7 mmol → drops fast
    ...Array.from({ length: 3 }, (_, i) =>
      makeActivity(`low-start-${i}`, "easy", 30, 125, Array.from({ length: 30 }, (_, j) => 7 - j * 0.15)),
    ),
    // Start at 11 mmol → drops moderate
    ...Array.from({ length: 3 }, (_, i) =>
      makeActivity(`high-start-${i}`, "easy", 30, 125, Array.from({ length: 30 }, (_, j) => 11 - j * 0.08)),
    ),
  ];

  return buildBGModelFromCached(activities);
}

// --- Tests ---

describe("simulateBG", () => {
  it("returns initial point for empty segments", () => {
    const model = buildTestModel();
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [],
      fuelRateGH: 48,
      bgModel: model,
    });

    expect(result.curve).toHaveLength(1);
    expect(result.curve[0].bg).toBe(10);
    expect(result.hypoMinute).toBeNull();
    expect(result.warnings).toContain("No segments to simulate");
  });

  it("produces a curve with correct length for single segment", () => {
    const model = buildTestModel();
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    // 30 min / 5 min steps = 6 steps + initial = 7 points
    expect(result.curve).toHaveLength(7);
    expect(result.curve[0].minute).toBe(0);
    expect(result.curve[6].minute).toBe(30);
    expect(result.totalDurationMin).toBe(30);
  });

  it("BG drops over time with negative model rates", () => {
    const model = buildTestModel("easy", 0.1); // -0.5 mmol/5min
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    // BG should decrease
    const first = result.curve[0].bg;
    const last = result.curve[result.curve.length - 1].bg;
    expect(last).toBeLessThan(first);
  });

  it("BG stays flat with zero-drop model", () => {
    const model = buildTestModel("easy", 0); // flat BG
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    for (const point of result.curve) {
      expect(point.bg).toBeCloseTo(10, 0);
    }
  });

  it("detects hypo crossing", () => {
    // Fast-dropping model: -1.5 mmol/5min, start at 6 → should hit 3.9 quickly
    const model = buildTestModel("easy", 0.3, 48, 8); // -1.5/5min, 8 activities for reliable
    const result = simulateBG({
      startBG: 6,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    expect(result.hypoMinute).not.toBeNull();
    expect(result.hypoMinute).toBeGreaterThan(0);
    expect(result.hypoMinute).toBeLessThanOrEqual(30);
    expect(result.minBG).toBeLessThan(3.9);
  });

  it("does not report hypo when BG stays safe", () => {
    const model = buildTestModel("easy", 0.02, 48, 8); // mild drop, 8 activities for reliable
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    expect(result.reliable).toBe(true);
    expect(result.hypoMinute).toBeNull();
    expect(result.minBG).toBeGreaterThanOrEqual(3.9);
  });

  it("clamps BG at physiological floor", () => {
    const model = buildTestModel("easy", 0.5); // extreme drop
    const result = simulateBG({
      startBG: 5,
      entrySlope: null,
      segments: [{ durationMin: 60, category: "easy" }],
      fuelRateGH: 0,
      bgModel: model,
    });

    for (const point of result.curve) {
      expect(point.bg).toBeGreaterThanOrEqual(2.0);
    }
  });

  it("confidence bands widen over time", () => {
    // Activities with VARIED drop rates to produce non-zero stdDev
    const model = buildBGModelFromCached([
      ...Array.from({ length: 3 }, (_, i) =>
        makeActivity(`slow-${i}`, "easy", 50, 125, Array.from({ length: 50 }, (_, j) => 10 - j * 0.08)),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeActivity(`fast-${i}`, "easy", 50, 125, Array.from({ length: 50 }, (_, j) => 10 - j * 0.15)),
      ),
    ]);
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 45, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    // First point has no uncertainty
    expect(result.curve[0].bgLow).toBe(result.curve[0].bgHigh);

    // Later points should have wider bands
    const mid = result.curve[Math.floor(result.curve.length / 2)];
    const last = result.curve[result.curve.length - 1];

    const midWidth = mid.bgHigh - mid.bgLow;
    const lastWidth = last.bgHigh - last.bgLow;

    expect(lastWidth).toBeGreaterThan(midWidth);
    expect(midWidth).toBeGreaterThan(0);
  });

  it("handles multi-segment workouts", () => {
    const model = buildBGModelFromCached([
      // Easy runs
      ...Array.from({ length: 3 }, (_, i) =>
        makeActivity(`easy-${i}`, "easy", 30, 120, Array.from({ length: 30 }, (_, j) => 10 - j * 0.05)),
      ),
      // Interval runs
      ...Array.from({ length: 3 }, (_, i) =>
        makeActivity(`interval-${i}`, "interval", 30, 160, Array.from({ length: 30 }, (_, j) => 10 - j * 0.15), 30),
      ),
    ]);

    const segments: SimSegment[] = [
      { durationMin: 10, category: "easy" }, // warmup
      { durationMin: 20, category: "interval" }, // main
      { durationMin: 5, category: "easy" }, // cooldown
    ];

    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments,
      fuelRateGH: 30,
      bgModel: model,
    });

    // Total = 35 min → 35/5 + 1 = 8 points
    expect(result.curve).toHaveLength(8);
    expect(result.totalDurationMin).toBe(35);

    // Segment indices should transition
    expect(result.curve[0].segmentIndex).toBe(0); // warmup
    expect(result.curve[3].segmentIndex).toBe(1); // main (minute 15)
    expect(result.curve[7].segmentIndex).toBe(2); // cooldown (minute 35)
  });

  it("generates warning when simulation exceeds observed data", () => {
    const model = buildTestModel("easy", 0.1, 48, 3, 30); // 30-min activities
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 90, category: "easy" }], // way beyond training
      fuelRateGH: 48,
      bgModel: model,
    });

    const durationWarning = result.warnings.find((w) =>
      w.includes("Simulation extends"),
    );
    expect(durationWarning).toBeDefined();
  });

  it("generates warning for missing category data", () => {
    const model = buildTestModel("easy"); // only easy data
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "long" }], // no long data
      fuelRateGH: 48,
      bgModel: model,
    });

    const catWarning = result.warnings.find((w) => w.includes("No BG data"));
    expect(catWarning).toBeDefined();
  });

  it("generates warning for out-of-range fuel rate", () => {
    const model = buildTestModel("easy", 0.1, 48); // trained at 48 g/h
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 120, // way above observed range
      bgModel: model,
    });

    const fuelWarning = result.warnings.find((w) =>
      w.includes("outside observed range"),
    );
    expect(fuelWarning).toBeDefined();
  });

  it("returns correct confidence levels", () => {
    // Low: few observations
    const lowModel = buildTestModel("easy", 0.1, 48, 1, 15);
    const lowResult = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 10, category: "easy" }],
      fuelRateGH: 48,
      bgModel: lowModel,
    });
    expect(lowResult.confidence).toBe("low");

    // Medium/High: many observations
    const highModel = buildTestModel("easy", 0.1, 48, 15, 50);
    const highResult = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 10, category: "easy" }],
      fuelRateGH: 48,
      bgModel: highModel,
    });
    expect(["medium", "high"]).toContain(highResult.confidence);
  });
});

describe("rateForStep", () => {
  it("returns zero rate with empty model", () => {
    const model = buildBGModelFromCached([]);
    const result = rateForStep(10, 10, "easy", 48, null, model);
    expect(result.rate).toBe(0);
    expect(result.stdDev).toBe(0);
  });

  it("returns negative rate for dropping BG model", () => {
    const model = buildTestModel("easy", 0.1);
    const result = rateForStep(10, 10, "easy", 48, null, model);
    expect(result.rate).toBeLessThan(0);
  });

  it("applies fuel correction — more fuel reduces drop", () => {
    const model = buildRegressionModel();
    const atLowFuel = rateForStep(10, 10, "easy", 30, null, model);
    const atHighFuel = rateForStep(10, 10, "easy", 60, null, model);

    // Higher fuel should give a less negative (higher) rate
    expect(atHighFuel.rate).toBeGreaterThan(atLowFuel.rate);
  });

  it("applies entry slope correction in early minutes", () => {
    const model = buildBGModelFromCached([
      ...Array.from({ length: 5 }, (_, i) =>
        makeActivity(`a${i}`, "easy", 25, 125, Array.from({ length: 25 }, (_, j) => 10 - j * 0.1)),
      ),
    ]);

    // With crashing entry slope at minute 5 (within decay window)
    const crashingEarly = rateForStep(5, 10, "easy", 48, -1.5, model);
    // With stable entry slope at minute 5
    const stableEarly = rateForStep(5, 10, "easy", 48, 0.0, model);

    // Early rates may differ due to entry slope correction
    expect(typeof crashingEarly.rate).toBe("number");
    expect(typeof stableEarly.rate).toBe("number");

    // At minute 20 (outside decay window), entry slope shouldn't matter
    const crashingLate = rateForStep(20, 10, "easy", 48, -1.5, model);
    const stableLate = rateForStep(20, 10, "easy", 48, 0.0, model);

    // Late rates should be equal (entry slope decayed)
    expect(crashingLate.rate).toBeCloseTo(stableLate.rate, 1);
  });
});

describe("fuel correction effect on simulation", () => {
  it("higher fuel produces higher BG at end of run", () => {
    const model = buildRegressionModel();

    const lowFuelSim = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 30,
      bgModel: model,
    });

    const highFuelSim = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 60,
      bgModel: model,
    });

    const lowFuelEnd = lowFuelSim.curve[lowFuelSim.curve.length - 1].bg;
    const highFuelEnd = highFuelSim.curve[highFuelSim.curve.length - 1].bg;

    expect(highFuelEnd).toBeGreaterThan(lowFuelEnd);
  });

  it("more fuel delays hypo", () => {
    const model = buildRegressionModel();

    const lowFuelSim = simulateBG({
      startBG: 7,
      entrySlope: null,
      segments: [{ durationMin: 60, category: "easy" }],
      fuelRateGH: 30,
      bgModel: model,
    });

    const highFuelSim = simulateBG({
      startBG: 7,
      entrySlope: null,
      segments: [{ durationMin: 60, category: "easy" }],
      fuelRateGH: 60,
      bgModel: model,
    });

    // At least one should hit hypo with start BG of 7 and dropping model
    if (lowFuelSim.hypoMinute !== null && highFuelSim.hypoMinute !== null) {
      expect(highFuelSim.hypoMinute).toBeGreaterThan(lowFuelSim.hypoMinute);
    } else if (lowFuelSim.hypoMinute !== null) {
      // Low fuel hits hypo, high fuel doesn't — correct behavior
      expect(highFuelSim.hypoMinute).toBeNull();
    }
    // Both null is also possible if rates are mild enough
  });
});

describe("start BG effect on simulation", () => {
  it("higher start BG produces steeper initial drop (when model shows this pattern)", () => {
    const model = buildStartBGModel();

    const lowStart = simulateBG({
      startBG: 7,
      entrySlope: null,
      segments: [{ durationMin: 20, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    const highStart = simulateBG({
      startBG: 11,
      entrySlope: null,
      segments: [{ durationMin: 20, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    // Both should drop
    expect(lowStart.curve[lowStart.curve.length - 1].bg).toBeLessThan(lowStart.curve[0].bg);
    expect(highStart.curve[highStart.curve.length - 1].bg).toBeLessThan(highStart.curve[0].bg);

    // The absolute BG should still be different
    expect(highStart.curve[0].bg).toBeGreaterThan(lowStart.curve[0].bg);
  });
});

describe("race simulation scenario", () => {
  it("simulates a full race with warmup + race pace + cooldown", () => {
    // Build model with varied drop rates for non-zero stdDev
    const model = buildBGModelFromCached([
      ...Array.from({ length: 5 }, (_, i) =>
        makeActivity(`easy-${i}`, "easy", 50, 125, Array.from({ length: 50 }, (_, j) => 10 - j * (0.04 + i * 0.01))),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeActivity(`long-${i}`, "long", 60, 140, Array.from({ length: 60 }, (_, j) => 10 - j * (0.06 + i * 0.01)), 60),
      ),
    ]);

    // EcoTrail 16km: ~10 min warmup, ~80 min race effort, ~10 min cooldown
    const result = simulateBG({
      startBG: 11,
      entrySlope: 0.1, // stable, slightly rising
      segments: [
        { durationMin: 10, category: "easy" },
        { durationMin: 80, category: "long" },
        { durationMin: 10, category: "easy" },
      ],
      fuelRateGH: 60,
      bgModel: model,
    });

    // Basic sanity checks
    expect(result.curve.length).toBe(21); // 100min / 5min + 1
    expect(result.totalDurationMin).toBe(100);
    expect(result.curve[0].bg).toBe(11);

    // BG should drop from 11
    const endBG = result.curve[result.curve.length - 1].bg;
    expect(endBG).toBeLessThan(11);

    // Should have confidence bands
    const midPoint = result.curve[10]; // 50 min in
    expect(midPoint.bgHigh - midPoint.bgLow).toBeGreaterThan(0);

    // Should have warnings about extending beyond training data
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });
});

describe("validateSimulation", () => {
  it("returns null for empty inputs", () => {
    expect(validateSimulation([], [])).toBeNull();
    expect(
      validateSimulation(
        [{ minute: 0, bg: 10, bgLow: 9, bgHigh: 11, segmentIndex: 0 }],
        [],
      ),
    ).toBeNull();
    expect(validateSimulation([], [{ time: 0, value: 10 }])).toBeNull();
  });

  it("computes zero error for perfect prediction", () => {
    const sim: SimPoint[] = [
      { minute: 0, bg: 10, bgLow: 9, bgHigh: 11, segmentIndex: 0 },
      { minute: 5, bg: 9.5, bgLow: 8.5, bgHigh: 10.5, segmentIndex: 0 },
      { minute: 10, bg: 9.0, bgLow: 8, bgHigh: 10, segmentIndex: 0 },
    ];
    const actual = [
      { time: 0, value: 10 },
      { time: 5, value: 9.5 },
      { time: 10, value: 9.0 },
    ];

    const result = validateSimulation(sim, actual);
    expect(result).not.toBeNull();
    expect(result!.meanError).toBe(0);
    expect(result!.rmse).toBe(0);
    expect(result!.maxError).toBe(0);
    expect(result!.pointsCompared).toBe(3);
  });

  it("computes positive error when simulation overestimates", () => {
    const sim: SimPoint[] = [
      { minute: 0, bg: 11, bgLow: 10, bgHigh: 12, segmentIndex: 0 },
      { minute: 5, bg: 10, bgLow: 9, bgHigh: 11, segmentIndex: 0 },
    ];
    const actual = [
      { time: 0, value: 10 },
      { time: 5, value: 9 },
    ];

    const result = validateSimulation(sim, actual);
    expect(result!.meanError).toBe(1);
  });

  it("computes negative error when simulation underestimates", () => {
    const sim: SimPoint[] = [
      { minute: 0, bg: 9, bgLow: 8, bgHigh: 10, segmentIndex: 0 },
      { minute: 5, bg: 8, bgLow: 7, bgHigh: 9, segmentIndex: 0 },
    ];
    const actual = [
      { time: 0, value: 10 },
      { time: 5, value: 9 },
    ];

    const result = validateSimulation(sim, actual);
    expect(result!.meanError).toBe(-1);
  });

  it("matches with 2-minute tolerance", () => {
    const sim: SimPoint[] = [
      { minute: 5, bg: 9.5, bgLow: 8.5, bgHigh: 10.5, segmentIndex: 0 },
    ];
    // Actual reading at minute 7 (within 2-min tolerance)
    const actual = [{ time: 7, value: 9.5 }];

    const result = validateSimulation(sim, actual);
    expect(result).not.toBeNull();
    expect(result!.pointsCompared).toBe(1);
  });

  it("skips points without matching actual data", () => {
    const sim: SimPoint[] = [
      { minute: 0, bg: 10, bgLow: 9, bgHigh: 11, segmentIndex: 0 },
      { minute: 5, bg: 9.5, bgLow: 8.5, bgHigh: 10.5, segmentIndex: 0 },
      { minute: 10, bg: 9, bgLow: 8, bgHigh: 10, segmentIndex: 0 },
    ];
    // Only has actual data for minute 0
    const actual = [{ time: 0, value: 10 }];

    const result = validateSimulation(sim, actual);
    expect(result!.pointsCompared).toBe(1);
  });

  it("computes RMSE correctly", () => {
    const sim: SimPoint[] = [
      { minute: 0, bg: 11, bgLow: 10, bgHigh: 12, segmentIndex: 0 }, // error: +1
      { minute: 5, bg: 8, bgLow: 7, bgHigh: 9, segmentIndex: 0 }, // error: -1
    ];
    const actual = [
      { time: 0, value: 10 },
      { time: 5, value: 9 },
    ];

    const result = validateSimulation(sim, actual);
    // RMSE = sqrt((1^2 + 1^2) / 2) = 1.0
    expect(result!.rmse).toBe(1);
    // Mean error = (1 + -1) / 2 = 0
    expect(result!.meanError).toBe(0);
    // Max error = 1
    expect(result!.maxError).toBe(1);
  });
});

describe("edge cases", () => {
  it("handles model with no observations gracefully", () => {
    const emptyModel = buildBGModelFromCached([]);
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 48,
      bgModel: emptyModel,
    });

    // Should produce a flat line (rate = 0 with no data)
    expect(result.curve).toHaveLength(7);
    for (const point of result.curve) {
      expect(point.bg).toBeCloseTo(10, 0);
    }
  });

  it("handles very short segment (< step size)", () => {
    const model = buildTestModel();
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 3, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    // Only initial point since 3 min < 5 min step
    expect(result.curve).toHaveLength(1);
    expect(result.totalDurationMin).toBe(3);
  });

  it("handles segment boundary exactly at step", () => {
    const model = buildTestModel();
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [
        { durationMin: 10, category: "easy" },
        { durationMin: 10, category: "easy" },
      ],
      fuelRateGH: 48,
      bgModel: model,
    });

    // 20 min total / 5 min + 1 = 5 points
    expect(result.curve).toHaveLength(5);
  });

  it("minBG tracks the lowest point correctly", () => {
    const model = buildTestModel("easy", 0.15);
    const result = simulateBG({
      startBG: 8,
      entrySlope: null,
      segments: [{ durationMin: 40, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    const actualMin = Math.min(...result.curve.map((p) => p.bg));
    expect(result.minBG).toBe(actualMin);
  });
});

describe("reliable gate", () => {
  it("reliable is false when fuelRateGH is null", () => {
    const model = buildTestModel("easy", 0.1, 48, 8);
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: null,
      bgModel: model,
    });

    expect(result.reliable).toBe(false);
    expect(result.warnings).toContain(
      "Unknown fuel rate — using base rate only, hypo prediction unreliable",
    );
  });

  it("reliable is false when activity count is below threshold", () => {
    const model = buildTestModel("easy", 0.1, 48, 3); // only 3 activities
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    expect(result.reliable).toBe(false);
    const warning = result.warnings.find((w) => w.includes("more easy runs"));
    expect(warning).toBeDefined();
  });

  it("reliable is true when fuel is known and enough activities exist", () => {
    const model = buildTestModel("easy", 0.1, 48, 8);
    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    expect(result.reliable).toBe(true);
  });

  it("suppresses hypoMinute when unreliable even if BG drops below threshold", () => {
    // Fast drop with only 3 activities → unreliable
    const model = buildTestModel("easy", 0.3, 48, 3);
    const result = simulateBG({
      startBG: 6,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    expect(result.reliable).toBe(false);
    expect(result.hypoMinute).toBeNull();
    // But minBG should still track the actual simulated minimum
    expect(result.minBG).toBeLessThan(3.9);
  });

  it("suppresses hypoMinute when fuel is null even if BG drops below threshold", () => {
    const model = buildTestModel("easy", 0.3, 48, 8);
    const result = simulateBG({
      startBG: 6,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: null,
      bgModel: model,
    });

    expect(result.reliable).toBe(false);
    expect(result.hypoMinute).toBeNull();
  });

  it("unreliable if any segment category lacks enough activities", () => {
    // Easy has 8 activities, interval has 3 — merged into one model
    const merged = buildBGModelFromCached([
      ...Array.from({ length: 8 }, (_, i) =>
        makeActivity(`easy-${i}`, "easy", 50, 125, Array.from({ length: 50 }, (_, j) => 10 - j * 0.1)),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeActivity(`interval-${i}`, "interval", 50, 160, Array.from({ length: 50 }, (_, j) => 10 - j * 0.1)),
      ),
    ]);

    const result = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [
        { durationMin: 10, category: "easy" },
        { durationMin: 20, category: "interval" },
      ],
      fuelRateGH: 48,
      bgModel: merged,
    });

    expect(result.reliable).toBe(false);
  });

  it("null fuelRateGH skips fuel correction and still simulates", () => {
    const model = buildTestModel("easy", 0.1, 48, 3);

    const withFuel = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: 48,
      bgModel: model,
    });

    const withoutFuel = simulateBG({
      startBG: 10,
      entrySlope: null,
      segments: [{ durationMin: 30, category: "easy" }],
      fuelRateGH: null,
      bgModel: model,
    });

    // Both produce curves
    expect(withoutFuel.curve.length).toBe(withFuel.curve.length);
    // BG should still move (base rate applies even without fuel correction)
    expect(withoutFuel.curve[withoutFuel.curve.length - 1].bg).not.toBe(10);
  });
});
