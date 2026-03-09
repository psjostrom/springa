import { describe, it, expect } from "vitest";
import {
  assessReadiness,
  formatGuidancePush,
  type PreRunInput,
  type PreRunGuidance,
} from "../prerun";
import type { BGResponseModel } from "../bgModel";

// --- Helpers ---

function makeInput(overrides: Partial<PreRunInput> = {}): PreRunInput {
  return {
    currentBG: 7.5,
    trendSlope: 0.0,
    bgModel: null,
    category: "easy",
    ...overrides,
  };
}

function makeModel(overrides: Partial<BGResponseModel> = {}): BGResponseModel {
  return {
    categories: { easy: null, long: null, interval: null },
    observations: [],
    activitiesAnalyzed: 0,
    bgByStartLevel: [],
    bgByEntrySlope: [],
    bgByTime: [],
    targetFuelRates: [],
    ...overrides,
  };
}

// --- BG Level dimension ---

describe("assessReadiness — BG level", () => {
  it("wait when BG < 4.5", () => {
    const g = assessReadiness(makeInput({ currentBG: 4.0 }));
    expect(g.level).toBe("wait");
    expect(g.reasons).toContain("BG too low to start");
  });

  it("caution when BG 4.5-6.9", () => {
    const g = assessReadiness(makeInput({ currentBG: 5.0 }));
    expect(g.level).toBe("caution");
    expect(g.reasons).toContain("BG on the low side");
  });

  it("caution at 6.5", () => {
    const g = assessReadiness(makeInput({ currentBG: 6.5 }));
    expect(g.level).toBe("caution");
    expect(g.reasons).toContain("BG on the low side");
  });

  it("ready when BG 7.0-14.0", () => {
    const g = assessReadiness(makeInput({ currentBG: 8.0 }));
    expect(g.level).toBe("ready");
  });

  it("caution when BG > 14.0", () => {
    const g = assessReadiness(makeInput({ currentBG: 15.0 }));
    expect(g.level).toBe("caution");
    expect(g.reasons).toContain("BG high — expect a steeper drop");
  });

  it("exactly 4.5 is caution not wait", () => {
    const g = assessReadiness(makeInput({ currentBG: 4.5 }));
    expect(g.level).toBe("caution");
  });

  it("6.9 is caution", () => {
    const g = assessReadiness(makeInput({ currentBG: 6.9 }));
    expect(g.level).toBe("caution");
  });

  it("7.0 is ready", () => {
    const g = assessReadiness(makeInput({ currentBG: 7.0 }));
    expect(g.level).toBe("ready");
  });

  it("exactly 14.0 is ready", () => {
    const g = assessReadiness(makeInput({ currentBG: 14.0 }));
    expect(g.level).toBe("ready");
  });
});

// --- Trend slope dimension ---

describe("assessReadiness — trend slope", () => {
  it("wait when slope < -0.5 (dropping fast)", () => {
    const g = assessReadiness(makeInput({ trendSlope: -0.8 }));
    expect(g.level).toBe("wait");
    expect(g.reasons).toContain("BG dropping fast");
  });

  it("caution when slope -0.5 to -0.3 (BG above 8)", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0, trendSlope: -0.4 }));
    expect(g.level).toBe("caution");
    expect(g.reasons).toContain("BG trending down");
  });

  it("ready when slope stable (-0.3 to +0.3)", () => {
    const g = assessReadiness(makeInput({ trendSlope: 0.0 }));
    expect(g.level).toBe("ready");
  });

  it("ready when slope rising (> +0.3)", () => {
    const g = assessReadiness(makeInput({ trendSlope: 0.8 }));
    expect(g.level).toBe("ready");
  });

  it("caution when slope is null (no data)", () => {
    const g = assessReadiness(makeInput({ trendSlope: null }));
    expect(g.level).toBe("caution");
    expect(g.reasons).toContain("No recent BG data");
  });

  it("exactly -0.5 is caution when BG above 8", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0, trendSlope: -0.5 }));
    expect(g.level).toBe("caution"); // -0.5 is >= -0.5, so it's in the -0.5 to -0.3 range
  });

  it("exactly -0.3 is caution", () => {
    const g = assessReadiness(makeInput({ trendSlope: -0.3 }));
    expect(g.level).toBe("caution");
    expect(g.reasons).toContain("BG trending down");
  });
});

// --- Model dimension ---

describe("assessReadiness — historical model", () => {
  it("predicts hypo when model says big drop", () => {
    const model = makeModel({
      activitiesAnalyzed: 5,
      bgByStartLevel: [
        { band: "<8", avgRate: -1.5, medianRate: -1.4, sampleCount: 20, activityCount: 3 },
      ],
    });
    const g = assessReadiness(makeInput({ currentBG: 6.0, bgModel: model }));
    // predicted drop = -1.5 * 3 = -4.5, estimated = 6.0 + (-4.5) = 1.5
    expect(g.estimatedBGAt30m).toBeCloseTo(1.5);
    expect(g.predictedDrop).toBeCloseTo(-4.5);
    expect(g.level).toBe("caution");
    expect(g.reasons).toContain("Model predicts hypo within 30 min");
  });

  it("uses entry slope data when available", () => {
    const model = makeModel({
      activitiesAnalyzed: 5,
      bgByStartLevel: [
        { band: "<8", avgRate: -0.5, medianRate: -0.5, sampleCount: 10, activityCount: 2 },
      ],
      bgByEntrySlope: [
        { slope: "stable", avgRate: -1.8, medianRate: -1.7, sampleCount: 15, activityCount: 3 },
      ],
    });
    // trendSlope 0.0 → classifyEntrySlope → "stable" → avgRate -1.8
    const g = assessReadiness(makeInput({ currentBG: 7.0, trendSlope: 0.0, bgModel: model }));
    // Uses slope-specific rate: -1.8 * 3 = -5.4, estimated = 7.0 - 5.4 = 1.6
    expect(g.predictedDrop).toBeCloseTo(-5.4);
    expect(g.estimatedBGAt30m).toBeCloseTo(1.6);
  });

  it("pulls target fuel rate from model", () => {
    const model = makeModel({
      activitiesAnalyzed: 3,
      bgByStartLevel: [
        { band: "8-10", avgRate: -0.3, medianRate: -0.3, sampleCount: 10, activityCount: 2 },
      ],
      targetFuelRates: [
        { category: "easy", targetFuelRate: 30, currentAvgFuel: 25, method: "extrapolation", confidence: "medium" },
        { category: "long", targetFuelRate: 45, currentAvgFuel: 40, method: "regression", confidence: "high" },
      ],
    });
    const g = assessReadiness(makeInput({ currentBG: 9.0, bgModel: model, category: "long" }));
    expect(g.targetFuel).toBe(45);
    expect(g.suggestions).toContain("Take 45g carbs/h");
  });

  it("caution when forecast drops below 5.5", () => {
    const model = makeModel({
      activitiesAnalyzed: 5,
      bgByStartLevel: [
        { band: "<8", avgRate: -0.5, medianRate: -0.5, sampleCount: 10, activityCount: 3 },
      ],
    });
    // predicted drop = -0.5 * 3 = -1.5, estimated = 7.0 + (-1.5) = 5.5 → borderline
    const g = assessReadiness(makeInput({ currentBG: 7.0, bgModel: model }));
    expect(g.estimatedBGAt30m).toBeCloseTo(5.5);
    expect(g.level).toBe("ready"); // 5.5 is NOT < 5.5

    // Drop slightly more: -0.55 * 3 = -1.65, estimated = 7.0 - 1.65 = 5.35
    const model2 = makeModel({
      activitiesAnalyzed: 5,
      bgByStartLevel: [
        { band: "<8", avgRate: -0.55, medianRate: -0.55, sampleCount: 10, activityCount: 3 },
      ],
    });
    const g2 = assessReadiness(makeInput({ currentBG: 7.0, bgModel: model2 }));
    expect(g2.estimatedBGAt30m).toBeCloseTo(5.35);
    expect(g2.level).toBe("caution");
    expect(g2.reasons).toContain("Model predicts hypo within 30 min");
  });

  it("graceful degradation with empty model", () => {
    const g = assessReadiness(makeInput({ bgModel: null }));
    expect(g.predictedDrop).toBeNull();
    expect(g.estimatedBGAt30m).toBeNull();
    expect(g.targetFuel).toBeNull();
    expect(g.level).toBe("ready"); // BG and slope are fine
  });

  it("graceful degradation with model that has no matching band", () => {
    const model = makeModel({
      activitiesAnalyzed: 3,
      bgByStartLevel: [
        { band: "12+", avgRate: -2.0, medianRate: -2.0, sampleCount: 5, activityCount: 2 },
      ],
    });
    // currentBG 7.0 → band "<8" — no match in model
    const g = assessReadiness(makeInput({ currentBG: 7.0, bgModel: model }));
    expect(g.predictedDrop).toBeNull();
    expect(g.estimatedBGAt30m).toBeNull();
  });
});

// --- Combined scenarios ---

describe("assessReadiness — combined", () => {
  it("low BG + dropping → wait", () => {
    const g = assessReadiness(makeInput({ currentBG: 4.2, trendSlope: -0.6 }));
    expect(g.level).toBe("wait");
    expect(g.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("high BG + stable → caution (from BG only)", () => {
    const g = assessReadiness(makeInput({ currentBG: 15.0, trendSlope: 0.0 }));
    expect(g.level).toBe("caution");
  });

  it("good BG + stable + no model → ready with stability reason", () => {
    const g = assessReadiness(makeInput({ currentBG: 8.0, trendSlope: 0.1 }));
    expect(g.level).toBe("ready");
    expect(g.reasons).toContain("BG stable");
  });

  it("good BG + rising → ready", () => {
    const g = assessReadiness(makeInput({ currentBG: 7.5, trendSlope: 1.0 }));
    expect(g.level).toBe("ready");
  });

  it("reasons capped at 3", () => {
    // Force many reasons: low BG + dropping + model hypo
    const model = makeModel({
      activitiesAnalyzed: 3,
      bgByStartLevel: [
        { band: "<8", avgRate: -2.0, medianRate: -2.0, sampleCount: 10, activityCount: 3 },
      ],
    });
    const g = assessReadiness(makeInput({ currentBG: 4.0, trendSlope: -0.8, bgModel: model }));
    expect(g.level).toBe("wait");
    expect(g.reasons.length).toBeLessThanOrEqual(3);
  });
});

// --- Compound rule: BG < 8 AND falling ---

describe("assessReadiness — compound low+falling rule", () => {
  it("wait when BG < 8 and slope < -0.3", () => {
    const g = assessReadiness(makeInput({ currentBG: 7.5, trendSlope: -0.4 }));
    expect(g.level).toBe("wait");
    expect(g.reasons).toContain("BG below 8 and falling — high hypo risk");
  });

  it("caution (not wait) when BG >= 8 and slope < -0.3", () => {
    const g = assessReadiness(makeInput({ currentBG: 8.0, trendSlope: -0.4 }));
    expect(g.level).toBe("caution");
    expect(g.reasons).not.toContain("BG below 8 and falling — high hypo risk");
  });

  it("does not trigger when slope is only mildly negative", () => {
    const g = assessReadiness(makeInput({ currentBG: 7.0, trendSlope: -0.2 }));
    expect(g.reasons).not.toContain("BG below 8 and falling — high hypo risk");
  });
});

// --- Fatigue adjustment ---

describe("assessReadiness — fatigue fuel adjustment", () => {
  it("bumps fuel when TSB < -4", () => {
    const model = makeModel({
      activitiesAnalyzed: 5,
      targetFuelRates: [{ category: "easy", currentFuelRate: 48, targetFuelRate: 48 }],
    });
    const g = assessReadiness(makeInput({ currentBG: 9.0, bgModel: model, currentTsb: -6 }));
    expect(g.reasons).toContain("High fatigue — expect steeper BG drops");
    expect(g.targetFuel).toBeGreaterThan(48);
    expect(g.suggestions.some((s) => s.includes("fatigue"))).toBe(true);
  });

  it("no fatigue bump when TSB >= -4", () => {
    const model = makeModel({
      activitiesAnalyzed: 5,
      targetFuelRates: [{ category: "easy", currentFuelRate: 48, targetFuelRate: 48 }],
    });
    const g = assessReadiness(makeInput({ currentBG: 9.0, bgModel: model, currentTsb: -2 }));
    expect(g.reasons).not.toContain("High fatigue — expect steeper BG drops");
  });

  it("no fatigue bump when TSB is null", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0, currentTsb: null }));
    expect(g.reasons).not.toContain("High fatigue — expect steeper BG drops");
  });
});

// --- IOB rule ---

describe("assessReadiness — IOB rule", () => {
  it("caution when IOB >= 0.5u", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0, iob: 1.2 }));
    expect(g.level).toBe("caution");
    expect(g.reasons).toContain("1.2u IOB — BG will keep dropping");
    expect(g.suggestions).toContain("Pre-load 15-20g carbs before starting");
  });

  it("exactly 0.5u triggers the rule", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0, iob: 0.5 }));
    expect(g.reasons.some((r) => r.includes("IOB"))).toBe(true);
  });

  it("no IOB warning when IOB < 0.5u", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0, iob: 0.3 }));
    expect(g.reasons.some((r) => r.includes("IOB"))).toBe(false);
  });

  it("no IOB warning when IOB is null", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0, iob: null }));
    expect(g.reasons.some((r) => r.includes("IOB"))).toBe(false);
  });

  it("no IOB warning when IOB is undefined", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0 }));
    expect(g.reasons.some((r) => r.includes("IOB"))).toBe(false);
  });
});

// --- formatGuidancePush ---

describe("formatGuidancePush", () => {
  it("formats ready level with reasons", () => {
    const guidance: PreRunGuidance = {
      level: "ready",
      reasons: ["BG stable"],
      suggestions: ["Take 30g carbs/h"],
      predictedDrop: null,
      targetFuel: 30,
      estimatedBGAt30m: null,
    };
    const { title, body } = formatGuidancePush(guidance, 7.5);
    expect(title).toBe("Ready to run — 7.5 mmol/L");
    expect(body).toBe("BG stable. Take 30g carbs/h");
  });

  it("formats caution level", () => {
    const guidance: PreRunGuidance = {
      level: "caution",
      reasons: ["BG on the low side"],
      suggestions: ["Have 15-20g carbs and give it 10 minutes"],
      predictedDrop: null,
      targetFuel: null,
      estimatedBGAt30m: null,
    };
    const { title, body } = formatGuidancePush(guidance, 5.0);
    expect(title).toBe("Heads up — 5.0 mmol/L");
    expect(body).toContain("BG on the low side");
  });

  it("formats wait level", () => {
    const guidance: PreRunGuidance = {
      level: "wait",
      reasons: ["BG too low to start"],
      suggestions: ["Eat 15-20g fast carbs and wait until BG climbs above 5"],
      predictedDrop: null,
      targetFuel: null,
      estimatedBGAt30m: null,
    };
    const { title, body } = formatGuidancePush(guidance, 3.8);
    expect(title).toBe("Hold on — 3.8 mmol/L");
    expect(body).toContain("BG too low to start");
  });

  it("falls back when no reasons or suggestions", () => {
    const guidance: PreRunGuidance = {
      level: "ready",
      reasons: [],
      suggestions: [],
      predictedDrop: null,
      targetFuel: null,
      estimatedBGAt30m: null,
    };
    const { body } = formatGuidancePush(guidance, 8.0);
    expect(body).toBe("Check your pre-run status");
  });

  it("caps combined parts at 3", () => {
    const guidance: PreRunGuidance = {
      level: "caution",
      reasons: ["R1", "R2"],
      suggestions: ["S1", "S2"],
      predictedDrop: null,
      targetFuel: null,
      estimatedBGAt30m: null,
    };
    const { body } = formatGuidancePush(guidance, 6.0);
    const parts = body.split(". ");
    expect(parts.length).toBeLessThanOrEqual(3);
  });
});
