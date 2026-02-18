import { describe, it, expect } from "vitest";
import {
  alignStreams,
  extractObservations,
  buildBGModel,
  suggestFuelAdjustments,
  classifyBGBand,
  analyzeBGByStartLevel,
  classifyTimeBucket,
  analyzeBGByTime,
  linearRegression,
  calculateTargetFuelRates,
  type BGObservation,
} from "../bgModel";
import type { IntervalsStream, DataPoint } from "../types";
import { DEFAULT_LTHR } from "../constants";

// Helper: create streams from arrays
function makeStreams(
  time: number[],
  hr: number[],
  glucose: number[],
): IntervalsStream[] {
  return [
    { type: "time", data: time },
    { type: "heartrate", data: hr },
    { type: "bloodglucose", data: glucose },
  ];
}

// Helper: generate time array in seconds (1 sample per second, 1 per minute sim)
function minuteTimeArray(minutes: number): number[] {
  return Array.from({ length: minutes }, (_, i) => i * 60);
}

// Helper: create a BGObservation for unit tests
function makeObs(overrides: Partial<BGObservation> = {}): BGObservation {
  return {
    zone: "easy",
    bgRate: -1.0,
    fuelRate: 48,
    activityId: "a1",
    timeMinute: 10,
    startBG: 10,
    relativeMinute: 10,
    ...overrides,
  };
}

describe("alignStreams", () => {
  it("returns null when streams are empty", () => {
    expect(alignStreams([])).toBeNull();
  });

  it("returns null when HR stream is missing", () => {
    const streams: IntervalsStream[] = [
      { type: "time", data: [0, 60, 120] },
      { type: "bloodglucose", data: [180, 175, 170] },
    ];
    expect(alignStreams(streams)).toBeNull();
  });

  it("returns null when glucose stream is missing", () => {
    const streams: IntervalsStream[] = [
      { type: "time", data: [0, 60, 120] },
      { type: "heartrate", data: [120, 130, 140] },
    ];
    expect(alignStreams(streams)).toBeNull();
  });

  it("returns null when too few aligned points", () => {
    const streams = makeStreams(
      [0, 60, 120],
      [120, 130, 140],
      [8.0, 7.5, 7.0],
    );
    expect(alignStreams(streams)).toBeNull();
  });

  it("aligns HR and glucose by minute", () => {
    const time = minuteTimeArray(10);
    const hr = Array(10).fill(125);
    const glucose = Array.from({ length: 10 }, (_, i) => 10 - i * 0.3);

    const result = alignStreams(makeStreams(time, hr, glucose));
    expect(result).not.toBeNull();
    expect(result!.hr.length).toBe(10);
    expect(result!.glucose.length).toBe(10);
    expect(result!.hr[0].time).toBe(0);
    expect(result!.glucose[0].value).toBeCloseTo(10);
  });

  it("handles mg/dL glucose values (auto-converts)", () => {
    const time = minuteTimeArray(10);
    const hr = Array(10).fill(125);
    // Values in mg/dL (~180 mg/dL = ~10 mmol/L)
    const glucose = Array(10).fill(180);

    const result = alignStreams(makeStreams(time, hr, glucose));
    expect(result).not.toBeNull();
    // Should be converted to mmol/L
    expect(result!.glucose[0].value).toBeCloseTo(180 / 18.018, 1);
  });

  it("tolerates 1-minute offset between HR and glucose", () => {
    // HR at minutes 0-9, glucose at minutes 1-10 (offset by 1)
    const time = minuteTimeArray(11);
    const hr = [...Array(10).fill(125), 0]; // HR for 0-9, zero at 10
    const glucose = [0, ...Array(10).fill(8.0)]; // zero at 0, glucose for 1-10

    const result = alignStreams(makeStreams(time, hr, glucose));
    expect(result).not.toBeNull();
    // Should find matches via +-1 tolerance
    expect(result!.hr.length).toBeGreaterThan(0);
  });
});

describe("extractObservations", () => {
  it("returns empty for insufficient data", () => {
    const result = extractObservations([], [], DEFAULT_LTHR, "a1", 48, 10);
    expect(result).toHaveLength(0);
  });

  it("skips first 5 and last 2 minutes", () => {
    // 15 minutes of data
    const hr: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
      time: i,
      value: 125, // easy zone
    }));
    const glucose: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
      time: i,
      value: 10 - i * 0.2,
    }));

    const obs = extractObservations(hr, glucose, DEFAULT_LTHR, "a1", 48, 10);

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

    const obs = extractObservations(hr, glucose, DEFAULT_LTHR, "a1", 48, 10);
    expect(obs.length).toBeGreaterThan(0);

    // Each 5-min window should show: (end - start) / 5 * 10 = -0.5 / 5 * 10 = -1.0
    for (const o of obs) {
      expect(o.bgRate).toBeCloseTo(-1.0, 0);
    }
  });

  it("classifies zones correctly based on HR", () => {
    const lthr = 169;
    // Easy: 66-78% = 112-132 bpm
    // Steady: 78-89% = 132-150 bpm
    // Tempo: 89-99% = 150-167 bpm
    // Hard: >99% = 167+ bpm

    const makeZoneObs = (hrVal: number) => {
      const hr: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
        time: i,
        value: hrVal,
      }));
      const glucose: DataPoint[] = Array.from({ length: 15 }, (_, i) => ({
        time: i,
        value: 10,
      }));
      return extractObservations(hr, glucose, lthr, "a1", 48, 10);
    };

    expect(makeZoneObs(120)[0].zone).toBe("easy");
    expect(makeZoneObs(140)[0].zone).toBe("steady");
    expect(makeZoneObs(155)[0].zone).toBe("tempo");
    expect(makeZoneObs(175)[0].zone).toBe("hard");
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

    const obs = extractObservations(hr, glucose, DEFAULT_LTHR, "run-42", 60, 10);
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

    const obs = extractObservations(hr, glucose, DEFAULT_LTHR, "a1", 48, 11);
    expect(obs[0].startBG).toBe(11);
    // First obs starts at minute 5 (SKIP_START), hr[0].time = 0, so relativeMinute = 5
    expect(obs[0].relativeMinute).toBe(5);
  });
});

describe("buildBGModel", () => {
  it("returns empty zones with no input", () => {
    const model = buildBGModel([]);
    expect(model.activitiesAnalyzed).toBe(0);
    expect(model.observations).toHaveLength(0);
    expect(model.zones.easy).toBeNull();
    expect(model.zones.steady).toBeNull();
    expect(model.zones.tempo).toBeNull();
    expect(model.zones.hard).toBeNull();
    expect(model.bgByStartLevel).toHaveLength(0);
    expect(model.bgByTime).toHaveLength(0);
    expect(model.targetFuelRates).toHaveLength(0);
  });

  it("builds model from single activity with linear BG drop", () => {
    const time = minuteTimeArray(25);
    const hr = Array(25).fill(125); // easy zone
    const glucose = Array.from({ length: 25 }, (_, i) => 10 - i * 0.1);

    const model = buildBGModel([
      {
        streams: makeStreams(time, hr, glucose),
        activityId: "a1",
        fuelRate: 48,
      },
    ]);

    expect(model.activitiesAnalyzed).toBe(1);
    expect(model.observations.length).toBeGreaterThan(0);
    expect(model.zones.easy).not.toBeNull();
    expect(model.zones.easy!.avgRate).toBeCloseTo(-1.0, 0);
    expect(model.zones.easy!.zone).toBe("easy");
  });

  it("assigns confidence correctly based on sample count", () => {
    // Build a model with few observations (low confidence)
    const time = minuteTimeArray(15);
    const hr = Array(15).fill(125);
    const glucose = Array.from({ length: 15 }, (_, i) => 10 - i * 0.1);

    const model = buildBGModel([
      {
        streams: makeStreams(time, hr, glucose),
        activityId: "a1",
        fuelRate: 48,
      },
    ]);

    expect(model.zones.easy).not.toBeNull();
    // With a 15-min activity, after skipping first 5 and last 2, we get ~3 windows
    expect(model.zones.easy!.confidence).toBe("low");
  });

  it("reaches medium confidence with 10+ samples", () => {
    // Multiple activities to accumulate samples
    const activities = Array.from({ length: 5 }, (_, i) => ({
      streams: makeStreams(
        minuteTimeArray(20),
        Array(20).fill(125),
        Array.from({ length: 20 }, (_, j) => 10 - j * 0.1),
      ),
      activityId: `a${i}`,
      fuelRate: 48,
    }));

    const model = buildBGModel(activities);
    expect(model.zones.easy).not.toBeNull();
    expect(["medium", "high"]).toContain(model.zones.easy!.confidence);
  });

  it("separates observations into correct zones", () => {
    const lthr = 169;
    const time = minuteTimeArray(20);

    // Activity 1: easy zone (HR 125)
    const a1 = {
      streams: makeStreams(time, Array(20).fill(125), Array(20).fill(8)),
      activityId: "easy-run",
      fuelRate: 48,
    };

    // Activity 2: tempo zone (HR 155)
    const a2 = {
      streams: makeStreams(time, Array(20).fill(155), Array(20).fill(8)),
      activityId: "interval-run",
      fuelRate: 30,
    };

    const model = buildBGModel([a1, a2], lthr);
    expect(model.zones.easy).not.toBeNull();
    expect(model.zones.tempo).not.toBeNull();
    expect(model.zones.easy!.avgFuelRate).toBe(48);
    expect(model.zones.tempo!.avgFuelRate).toBe(30);
  });

  it("excludes null fuel rates from avgFuelRate", () => {
    const time = minuteTimeArray(20);

    const a1 = {
      streams: makeStreams(time, Array(20).fill(125), Array(20).fill(8)),
      activityId: "with-fuel",
      fuelRate: 48,
    };

    const a2 = {
      streams: makeStreams(time, Array(20).fill(125), Array(20).fill(8)),
      activityId: "no-fuel",
      fuelRate: null,
    };

    const model = buildBGModel([a1, a2]);
    expect(model.zones.easy).not.toBeNull();
    // Should only average the activity that has fuel data
    expect(model.zones.easy!.avgFuelRate).toBe(48);
  });

  it("returns null avgFuelRate when no activities have fuel data", () => {
    const time = minuteTimeArray(20);

    const model = buildBGModel([
      {
        streams: makeStreams(time, Array(20).fill(125), Array(20).fill(8)),
        activityId: "no-fuel",
        fuelRate: null,
      },
    ]);

    expect(model.zones.easy).not.toBeNull();
    expect(model.zones.easy!.avgFuelRate).toBeNull();
  });

  it("computes median correctly", () => {
    const time = minuteTimeArray(20);
    const hr = Array(20).fill(125);
    // Flat BG → rate ≈ 0
    const glucose = Array(20).fill(8.0);

    const model = buildBGModel([
      { streams: makeStreams(time, hr, glucose), activityId: "a1", fuelRate: 48 },
    ]);

    expect(model.zones.easy).not.toBeNull();
    expect(model.zones.easy!.medianRate).toBeCloseTo(0, 0);
  });

  it("skips activities without aligned data", () => {
    // Activity with HR but no glucose
    const streams: IntervalsStream[] = [
      { type: "time", data: minuteTimeArray(20) },
      { type: "heartrate", data: Array(20).fill(125) },
    ];

    const model = buildBGModel([
      { streams, activityId: "no-glucose", fuelRate: 48 },
    ]);

    expect(model.activitiesAnalyzed).toBe(0);
    expect(model.observations).toHaveLength(0);
  });

  it("populates bgByStartLevel, bgByTime, and targetFuelRates", () => {
    const time = minuteTimeArray(25);
    const hr = Array(25).fill(125);
    const glucose = Array.from({ length: 25 }, (_, i) => 10 - i * 0.1);

    const model = buildBGModel([
      {
        streams: makeStreams(time, hr, glucose),
        activityId: "a1",
        fuelRate: 48,
      },
    ]);

    // Starting BG is 10, so should land in "8-10" or "10-12" band
    expect(model.bgByStartLevel.length).toBeGreaterThan(0);
    // Time buckets should be populated (observations start at relative minute 5)
    expect(model.bgByTime.length).toBeGreaterThan(0);
    // BG is dropping with fuel → target fuel rates should be populated
    expect(model.targetFuelRates.length).toBeGreaterThan(0);
  });
});

describe("suggestFuelAdjustments", () => {
  it("returns empty for stable BG", () => {
    const model = buildBGModel([
      {
        streams: makeStreams(
          minuteTimeArray(20),
          Array(20).fill(125),
          Array(20).fill(8.0), // flat BG
        ),
        activityId: "a1",
        fuelRate: 48,
      },
    ]);

    const suggestions = suggestFuelAdjustments(model);
    expect(suggestions).toHaveLength(0);
  });

  it("suggests fuel increase for fast-dropping BG", () => {
    // BG drops from 10 to 4 over 20 minutes (-0.3/min → -3.0/10min)
    const model = buildBGModel([
      {
        streams: makeStreams(
          minuteTimeArray(20),
          Array(20).fill(125),
          Array.from({ length: 20 }, (_, i) => 10 - i * 0.3),
        ),
        activityId: "a1",
        fuelRate: 48,
      },
    ]);

    const suggestions = suggestFuelAdjustments(model);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].zone).toBe("easy");
    expect(suggestions[0].suggestedIncrease).toBeGreaterThan(0);
    expect(suggestions[0].avgDropRate).toBeLessThan(-1.0);
  });

  it("does not suggest for moderate drops (> -1.0)", () => {
    // BG drops mildly: -0.04/min → -0.4/10min
    const model = buildBGModel([
      {
        streams: makeStreams(
          minuteTimeArray(20),
          Array(20).fill(125),
          Array.from({ length: 20 }, (_, i) => 10 - i * 0.04),
        ),
        activityId: "a1",
        fuelRate: 48,
      },
    ]);

    const suggestions = suggestFuelAdjustments(model);
    expect(suggestions).toHaveLength(0);
  });

  it("scales fuel increase proportionally to excess drop", () => {
    // Very fast drop: -0.5/min → -5.0/10min (excess = 4.0, expect 8 * 6 = 48 g/h increase)
    const model = buildBGModel([
      {
        streams: makeStreams(
          minuteTimeArray(20),
          Array(20).fill(125),
          Array.from({ length: 20 }, (_, i) => 10 - i * 0.5),
        ),
        activityId: "a1",
        fuelRate: 48,
      },
    ]);

    const suggestions = suggestFuelAdjustments(model);
    expect(suggestions.length).toBeGreaterThan(0);
    // Drop rate ~-5.0/10m, excess ~4.0, ceil(4.0/0.5)*6 = 48
    // But window edge effects may reduce the observed rate slightly
    expect(suggestions[0].suggestedIncrease).toBeGreaterThanOrEqual(30);
    expect(suggestions[0].suggestedIncrease).toBeLessThanOrEqual(48);
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
      makeObs({ startBG: 7, bgRate: -2.0, activityId: "a1" }),
      makeObs({ startBG: 9, bgRate: -1.0, activityId: "a2" }),
      makeObs({ startBG: 11, bgRate: -0.5, activityId: "a3" }),
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
      makeObs({ startBG: 9, bgRate: -1.0, activityId: "a1" }),
      makeObs({ startBG: 9.5, bgRate: -2.0, activityId: "a2" }),
      makeObs({ startBG: 8.5, bgRate: -3.0, activityId: "a3" }),
    ];

    const result = analyzeBGByStartLevel(obs);
    expect(result).toHaveLength(1);
    expect(result[0].band).toBe("8-10");
    expect(result[0].avgRate).toBeCloseTo(-2.0);
    expect(result[0].medianRate).toBeCloseTo(-2.0);
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

  it("filters by zone when provided", () => {
    const obs: BGObservation[] = [
      makeObs({ zone: "easy", relativeMinute: 5, bgRate: -0.5 }),
      makeObs({ zone: "tempo", relativeMinute: 5, bgRate: -1.5 }),
      makeObs({ zone: "easy", relativeMinute: 20, bgRate: -1.0 }),
    ];

    const result = analyzeBGByTime(obs, "easy");
    expect(result).toHaveLength(2);
    // All results should only contain easy zone data
    expect(result[0].avgRate).toBeCloseTo(-0.5);
    expect(result[1].avgRate).toBeCloseTo(-1.0);
  });

  it("returns empty when zone filter matches nothing", () => {
    const obs: BGObservation[] = [
      makeObs({ zone: "easy", relativeMinute: 5 }),
    ];
    expect(analyzeBGByTime(obs, "hard")).toHaveLength(0);
  });
});

describe("linearRegression", () => {
  it("returns zeros for less than 2 points", () => {
    const result = linearRegression([{ x: 1, y: 2 }]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(0);
    expect(result.rSquared).toBe(0);
  });

  it("computes perfect fit for two points", () => {
    const result = linearRegression([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
    ]);
    expect(result.slope).toBeCloseTo(2);
    expect(result.intercept).toBeCloseTo(0);
    expect(result.rSquared).toBeCloseTo(1);
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
    expect(result.rSquared).toBeCloseTo(1);
  });

  it("computes r-squared < 1 for noisy data", () => {
    const result = linearRegression([
      { x: 1, y: 2 },
      { x: 2, y: 5 },
      { x: 3, y: 4 },
      { x: 4, y: 8 },
    ]);
    expect(result.rSquared).toBeGreaterThan(0);
    expect(result.rSquared).toBeLessThan(1);
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
      makeObs({ bgRate: -1.0, fuelRate: 48 }),
    );

    const result = calculateTargetFuelRates(obs);
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("extrapolation");
    // target = 48 + 1.0 * 12 = 60
    expect(result[0].targetFuelRate).toBe(60);
    expect(result[0].zone).toBe("easy");
  });

  it("uses regression with 2+ distinct fuel rates with 3+ obs each", () => {
    const obs: BGObservation[] = [
      // Fuel 30 → high drop
      ...Array.from({ length: 3 }, () => makeObs({ bgRate: -2.0, fuelRate: 30 })),
      // Fuel 60 → low drop
      ...Array.from({ length: 3 }, () => makeObs({ bgRate: -0.5, fuelRate: 60 })),
    ];

    const result = calculateTargetFuelRates(obs);
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("regression");
    // With fuel 30 → rate -2.0 and fuel 60 → rate -0.5:
    // slope = (-0.5 - -2.0) / (60 - 30) = 1.5/30 = 0.05
    // intercept = y - slope*x using (30, -2.0): -2.0 - 0.05*30 = -3.5
    // x-intercept = 3.5 / 0.05 = 70
    expect(result[0].targetFuelRate).toBe(70);
  });

  it("clamps target fuel rate to >= 0", () => {
    // Very slight drop with high fuel — extrapolation stays positive
    const obs: BGObservation[] = Array.from({ length: 5 }, () =>
      makeObs({ bgRate: -0.1, fuelRate: 0 }),
    );

    const result = calculateTargetFuelRates(obs);
    expect(result).toHaveLength(1);
    expect(result[0].targetFuelRate).toBeGreaterThanOrEqual(0);
  });

  it("excludes observations with null fuelRate", () => {
    const obs: BGObservation[] = [
      makeObs({ bgRate: -1.5, fuelRate: 48 }),
      makeObs({ bgRate: -1.5, fuelRate: 48 }),
      makeObs({ bgRate: -1.5, fuelRate: 48 }),
      makeObs({ bgRate: -1.5, fuelRate: null }), // should be excluded
    ];

    const result = calculateTargetFuelRates(obs);
    expect(result).toHaveLength(1);
    expect(result[0].currentAvgFuel).toBe(48);
  });
});
