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

// --- Trend-based forecast ---

describe("assessReadiness — 30-min forecast", () => {
  it("projects BG using current trend slope", () => {
    // slope -0.8/10m → drop 2.4 in 30m → 7.5 - 2.4 = 5.1
    const g = assessReadiness(makeInput({ currentBG: 7.5, trendSlope: -0.8 }));
    expect(g.predictedDrop).toBeCloseTo(-2.4);
    expect(g.estimatedBGAt30m).toBeCloseTo(5.1);
  });

  it("shows rising forecast when trending up", () => {
    const g = assessReadiness(makeInput({ currentBG: 7.0, trendSlope: 0.5 }));
    expect(g.predictedDrop).toBeCloseTo(1.5);
    expect(g.estimatedBGAt30m).toBeCloseTo(8.5);
  });

  it("caution when trend predicts hypo", () => {
    // slope -1.3/10m → drop 3.9 in 30m → 5.4 - 3.9 = 1.5
    const g = assessReadiness(makeInput({ currentBG: 5.4, trendSlope: -1.3 }));
    expect(g.estimatedBGAt30m).toBeCloseTo(1.5);
    expect(g.reasons).toContain("Trend predicts hypo within 30 min");
  });

  it("no forecast when trend is null", () => {
    const g = assessReadiness(makeInput({ trendSlope: null }));
    expect(g.predictedDrop).toBeNull();
    expect(g.estimatedBGAt30m).toBeNull();
  });

  it("stable trend shows minimal change", () => {
    const g = assessReadiness(makeInput({ currentBG: 8.0, trendSlope: 0.0 }));
    expect(g.predictedDrop).toBeCloseTo(0);
    expect(g.estimatedBGAt30m).toBeCloseTo(8.0);
  });
});

// --- Model dimension (fuel rates only) ---

describe("assessReadiness — historical model", () => {
  it("pulls target fuel rate from model", () => {
    const model = makeModel({
      activitiesAnalyzed: 3,
      targetFuelRates: [
        { category: "easy", targetFuelRate: 30, currentAvgFuel: 25, method: "extrapolation", confidence: "medium" },
        { category: "long", targetFuelRate: 45, currentAvgFuel: 40, method: "regression", confidence: "high" },
      ],
    });
    const g = assessReadiness(makeInput({ currentBG: 9.0, bgModel: model, category: "long" }));
    expect(g.targetFuel).toBe(45);
    expect(g.suggestions).toContain("During run: 45g/h");
  });

  it("graceful degradation with empty model", () => {
    const g = assessReadiness(makeInput({ bgModel: null }));
    // Forecast still works (from trend), but no fuel rate without model
    expect(g.predictedDrop).toBeCloseTo(0); // stable trend → 0 drop
    expect(g.estimatedBGAt30m).toBeCloseTo(7.5); // stays at default BG
    expect(g.targetFuel).toBeNull();
    expect(g.level).toBe("ready"); // BG and slope are fine
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

  it("reasons capped at 4", () => {
    // Force many reasons: low BG + dropping fast + model hypo + fatigue + IOB
    const model = makeModel({
      activitiesAnalyzed: 3,
      bgByStartLevel: [
        { band: "<8", avgRate: -2.0, medianRate: -2.0, sampleCount: 10, activityCount: 3 },
      ],
    });
    const g = assessReadiness(makeInput({
      currentBG: 4.0,
      trendSlope: -0.8,
      bgModel: model,
      currentTsb: -6,
      iob: 1.5,
    }));
    expect(g.level).toBe("wait");
    expect(g.reasons.length).toBeLessThanOrEqual(4);
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
      targetFuelRates: [{ category: "easy", currentAvgFuel: 48, targetFuelRate: 48, method: "regression", confidence: "high" }],
    });
    const g = assessReadiness(makeInput({ currentBG: 9.0, bgModel: model, currentTsb: -6 }));
    expect(g.reasons).toContain("High fatigue — expect steeper BG drops");
    expect(g.targetFuel).toBeGreaterThan(48);
    expect(g.suggestions.some((s) => s.includes("fatigue"))).toBe(true);
  });

  it("no fatigue bump when TSB >= -4", () => {
    const model = makeModel({
      activitiesAnalyzed: 5,
      targetFuelRates: [{ category: "easy", currentAvgFuel: 48, targetFuelRate: 48, method: "regression", confidence: "high" }],
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
  it("caution when IOB >= 0.5u with consolidated carb suggestion", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0, iob: 1.2 }));
    expect(g.level).toBe("caution");
    expect(g.reasons).toContain("1.2u IOB — BG will keep dropping");
    // IOB carbs: 1.2u * 12g/u = 14.4, rounded to 15g
    expect(g.suggestions.some((s) => s.includes("15g") && s.includes("1.2u IOB"))).toBe(true);
  });

  it("exactly 0.5u triggers the rule", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0, iob: 0.5 }));
    expect(g.reasons.some((r) => r.includes("IOB"))).toBe(true);
  });

  it("IOB carbs scale with magnitude", () => {
    // 0.5u → 0.5 * 12 = 6, round to 5g
    const g1 = assessReadiness(makeInput({ currentBG: 9.0, iob: 0.5 }));
    expect(g1.suggestions.some((s) => s.includes("5g"))).toBe(true);

    // 2.0u → 2.0 * 12 = 24, round to 25g
    const g2 = assessReadiness(makeInput({ currentBG: 9.0, iob: 2.0 }));
    expect(g2.suggestions.some((s) => s.includes("25g"))).toBe(true);
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

// --- Compound + IOB worst-case ---

describe("assessReadiness — compound low+falling with IOB", () => {
  it("wait when BG < 8, falling, and IOB >= 0.5 with consolidated carbs", () => {
    const g = assessReadiness(makeInput({ currentBG: 7.2, trendSlope: -0.4, iob: 1.0 }));
    expect(g.level).toBe("wait");
    expect(g.reasons).toContain("BG below 8 and falling — high hypo risk");
    expect(g.reasons.some((r) => r.includes("IOB"))).toBe(true);
    // Compound: 20g + IOB 1.0u * 12 = 12, round to 10g → total 30g
    expect(g.suggestions.some((s) => s.includes("30g") && s.includes("low + falling") && s.includes("1.0u IOB"))).toBe(true);
    expect(g.suggestions.some((s) => s.includes("wait for upward trend"))).toBe(true);
  });

  it("stacks IOB carbs on top of compound carbs correctly", () => {
    // Compound: 20g base
    // IOB 0.5u: 0.5 * 12 = 6, round to 5g
    // Total: 25g
    const g1 = assessReadiness(makeInput({ currentBG: 7.0, trendSlope: -0.35, iob: 0.5 }));
    expect(g1.suggestions.some((s) => s.includes("25g"))).toBe(true);

    // Compound: 20g base
    // IOB 2.5u: 2.5 * 12 = 30g
    // Total: 50g
    const g2 = assessReadiness(makeInput({ currentBG: 7.0, trendSlope: -0.35, iob: 2.5 }));
    expect(g2.suggestions.some((s) => s.includes("50g"))).toBe(true);
  });
});

// --- Worst-case scenario: verify consolidated output ---

describe("assessReadiness — worst-case consolidated output", () => {
  it("produces clear, non-redundant suggestions in extreme scenario", () => {
    // Worst case: low BG (6.5), falling (-0.4), high IOB (0.8u), fatigued (TSB -5)
    const model = makeModel({
      activitiesAnalyzed: 5,
      targetFuelRates: [
        { category: "easy", currentAvgFuel: 48, targetFuelRate: 55, method: "regression", confidence: "high" },
      ],
    });

    const g = assessReadiness(makeInput({
      currentBG: 6.5,
      trendSlope: -0.4,
      bgModel: model,
      currentTsb: -5,
      iob: 0.8,
      category: "easy",
    }));

    // Should be "wait" due to compound rule
    expect(g.level).toBe("wait");

    // Reasons should include all relevant factors
    expect(g.reasons).toContain("BG below 8 and falling — high hypo risk");
    expect(g.reasons.some((r) => r.includes("IOB"))).toBe(true);
    expect(g.reasons.some((r) => r.includes("fatigue"))).toBe(true);

    // Suggestions should be consolidated and clear:
    // 1. ONE pre-run carb suggestion (compound 20g + IOB 0.8*12=10g = 30g)
    // 2. Fuel suggestion with fatigue bump
    expect(g.suggestions.length).toBeLessThanOrEqual(4); // not 5-6 redundant ones

    // Pre-run carbs consolidated
    const preRunSuggestion = g.suggestions.find((s) => s.includes("Eat") && s.includes("carbs"));
    expect(preRunSuggestion).toBeDefined();
    expect(preRunSuggestion).toContain("30g"); // 20 + 10
    expect(preRunSuggestion).toContain("low + falling");
    expect(preRunSuggestion).toContain("0.8u IOB");
    expect(preRunSuggestion).toContain("wait for upward trend");

    // No redundant separate 15-20g suggestions
    const carbSuggestions = g.suggestions.filter((s) =>
      s.includes("15-20g") || (s.includes("carbs") && s.includes("before"))
    );
    expect(carbSuggestions.length).toBeLessThanOrEqual(1);

    // Fuel suggestion present with fatigue bump
    const fuelSuggestion = g.suggestions.find((s) => s.includes("During run:"));
    expect(fuelSuggestion).toBeDefined();
    expect(fuelSuggestion).toContain("fatigue");
    // Base 55 + 20% = 66
    expect(g.targetFuel).toBe(66);
  });

  it("only shows IOB carbs when BG is fine", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0, trendSlope: 0.0, iob: 1.5 }));
    expect(g.level).toBe("caution");

    // Should have ONE suggestion for IOB carbs (1.5 * 12 = 18, round to 20g)
    const preRunSuggestion = g.suggestions.find((s) => s.includes("carbs"));
    expect(preRunSuggestion).toBeDefined();
    expect(preRunSuggestion).toContain("20g");
    expect(preRunSuggestion).toContain("1.5u IOB");
    // Should NOT mention low BG since BG is fine
    expect(preRunSuggestion).not.toContain("low");
  });

  it("shows no pre-run carbs when everything is fine", () => {
    const g = assessReadiness(makeInput({ currentBG: 9.0, trendSlope: 0.1, iob: 0.2 }));
    expect(g.level).toBe("ready");

    // No carb suggestions (except maybe fuel)
    const preRunCarbSuggestion = g.suggestions.find((s) =>
      s.includes("carbs") && !s.includes("During run")
    );
    expect(preRunCarbSuggestion).toBeUndefined();
  });

  it("uses urgent wording and higher carbs for actual hypo (BG < 4.5)", () => {
    const g = assessReadiness(makeInput({ currentBG: 4.0, trendSlope: 0.0 }));
    expect(g.level).toBe("wait");
    expect(g.reasons).toContain("BG too low to start");

    // Should get 20g (not 15g) and "wait for upward trend" wording
    const preRunSuggestion = g.suggestions.find((s) => s.includes("carbs"));
    expect(preRunSuggestion).toBeDefined();
    expect(preRunSuggestion).toContain("20g");
    expect(preRunSuggestion).toContain("hypo");
    expect(preRunSuggestion).toContain("wait for upward trend");
  });

  it("stacks hypo carbs with IOB correctly", () => {
    // BG 4.0 (hypo): 20g base
    // IOB 1.0u: 10g additional
    // Total: 30g
    const g = assessReadiness(makeInput({ currentBG: 4.0, trendSlope: 0.0, iob: 1.0 }));
    expect(g.level).toBe("wait");

    const preRunSuggestion = g.suggestions.find((s) => s.includes("carbs"));
    expect(preRunSuggestion).toContain("30g");
    expect(preRunSuggestion).toContain("hypo");
    expect(preRunSuggestion).toContain("1.0u IOB");
  });
});

// --- formatGuidancePush ---

describe("formatGuidancePush", () => {
  it("formats ready level with suggestion first, then reason", () => {
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
    // Push notifications prioritize actionable suggestions over reasons
    expect(body).toBe("Take 30g carbs/h. BG stable");
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
