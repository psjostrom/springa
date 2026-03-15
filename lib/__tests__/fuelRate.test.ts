import { describe, it, expect } from "vitest";
import { getFuelConfidence } from "../fuelRate";
import type { BGResponseModel, TargetFuelResult } from "../bgModel";

function makeTarget(
  category: "easy" | "long" | "interval",
  rate: number,
  confidence: "low" | "medium" | "high" = "medium",
): TargetFuelResult {
  return { category, targetFuelRate: rate, currentAvgFuel: rate - 5, method: "regression", confidence };
}

function makeBGModel(targets: TargetFuelResult[] = []): BGResponseModel {
  return {
    categories: {
      easy: { category: "easy", avgRate: -0.3, medianRate: -0.3, sampleCount: 20, confidence: "medium", avgFuelRate: 45, activityCount: 5, maxDurationMin: 40 },
      long: { category: "long", avgRate: -0.6, medianRate: -0.55, sampleCount: 15, confidence: "medium", avgFuelRate: 58, activityCount: 4, maxDurationMin: 60 },
      interval: { category: "interval", avgRate: -0.8, medianRate: -0.75, sampleCount: 10, confidence: "low", avgFuelRate: 28, activityCount: 3, maxDurationMin: 30 },
    },
    observations: [],
    activitiesAnalyzed: 12,
    bgByStartLevel: [],
    bgByEntrySlope: [],
    bgByTime: [],
    targetFuelRates: targets,
  };
}

describe("getFuelConfidence", () => {
  it("returns confidence from matching target", () => {
    const bgModel = makeBGModel([makeTarget("easy", 48, "high")]);
    expect(getFuelConfidence("easy", bgModel)).toBe("high");
  });

  it("returns null when no target exists for category", () => {
    const bgModel = makeBGModel([makeTarget("easy", 48)]);
    expect(getFuelConfidence("interval", bgModel)).toBeNull();
  });

  it("returns null when bgModel is null", () => {
    expect(getFuelConfidence("easy", null)).toBeNull();
  });

  it("returns null when bgModel is undefined", () => {
    expect(getFuelConfidence("easy", undefined)).toBeNull();
  });

  it("returns low confidence for low-confidence target", () => {
    const bgModel = makeBGModel([makeTarget("long", 65, "low")]);
    expect(getFuelConfidence("long", bgModel)).toBe("low");
  });
});
