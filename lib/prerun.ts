import type { WorkoutCategory } from "./types";
import type { BGResponseModel } from "./bgModel";
import { classifyBGBand, classifyEntrySlope } from "./bgModel";

// --- Types ---

export interface PreRunInput {
  currentBG: number; // mmol/L
  trendSlope: number | null; // mmol/L per 10min (from computeTrend)
  bgModel: BGResponseModel | null;
  category: WorkoutCategory;
}

export type ReadinessLevel = "ready" | "caution" | "wait";

export interface PreRunGuidance {
  level: ReadinessLevel;
  reasons: string[];
  suggestions: string[];
  predictedDrop: number | null; // mmol/L over 30 min
  targetFuel: number | null; // g/h
  estimatedBGAt30m: number | null;
}

// --- Readiness assessment ---

function worst(a: ReadinessLevel, b: ReadinessLevel): ReadinessLevel {
  const rank: Record<ReadinessLevel, number> = { ready: 0, caution: 1, wait: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function assessBGLevel(bg: number): { level: ReadinessLevel; reasons: string[]; suggestions: string[] } {
  if (bg < 4.5) {
    return {
      level: "wait",
      reasons: ["BG too low to start"],
      suggestions: ["Eat 15-20g fast carbs and wait until BG climbs above 5"],
    };
  }
  if (bg <= 5.5) {
    return {
      level: "caution",
      reasons: ["BG on the low side"],
      suggestions: ["Have 15-20g carbs and give it 10 minutes"],
    };
  }
  if (bg <= 14.0) {
    return { level: "ready", reasons: [], suggestions: [] };
  }
  return {
    level: "caution",
    reasons: ["BG high — expect a steeper drop"],
    suggestions: [],
  };
}

function assessTrendSlope(slope: number | null): { level: ReadinessLevel; reasons: string[]; suggestions: string[] } {
  if (slope === null) {
    return {
      level: "caution",
      reasons: ["No recent BG data"],
      suggestions: ["Wait for a fresh reading"],
    };
  }
  if (slope < -0.5) {
    return {
      level: "wait",
      reasons: ["BG dropping fast"],
      suggestions: ["Hold off until the trend levels out"],
    };
  }
  if (slope < -0.3) {
    return {
      level: "caution",
      reasons: ["BG trending down"],
      suggestions: [],
    };
  }
  // stable or rising
  return { level: "ready", reasons: [], suggestions: [] };
}

function assessModel(
  currentBG: number,
  trendSlope: number | null,
  bgModel: BGResponseModel | null,
  category: WorkoutCategory,
): { level: ReadinessLevel; reasons: string[]; suggestions: string[]; predictedDrop: number | null; targetFuel: number | null; estimatedBGAt30m: number | null } {
  const result = {
    level: "ready" as ReadinessLevel,
    reasons: [] as string[],
    suggestions: [] as string[],
    predictedDrop: null as number | null,
    targetFuel: null as number | null,
    estimatedBGAt30m: null as number | null,
  };

  if (!bgModel || bgModel.activitiesAnalyzed === 0) return result;

  // Look up BG band drop rate
  const band = classifyBGBand(currentBG);
  const bandData = bgModel.bgByStartLevel.find((b) => b.band === band);

  // Look up entry slope drop rate if available
  let slopeRate: number | null = null;
  if (trendSlope !== null) {
    const slopeCategory = classifyEntrySlope(trendSlope);
    const slopeData = bgModel.bgByEntrySlope.find((s) => s.slope === slopeCategory);
    if (slopeData) slopeRate = slopeData.avgRate;
  }

  // Use the best available rate: prefer slope-specific, fall back to band
  const avgRate = slopeRate ?? bandData?.avgRate ?? null;

  if (avgRate !== null) {
    // avgRate is mmol/L per 10 min; project over 30 min
    result.predictedDrop = avgRate * 3;
    result.estimatedBGAt30m = currentBG + result.predictedDrop;

    if (result.estimatedBGAt30m < 4.0) {
      result.level = "caution";
      result.reasons.push("Model predicts hypo within 30 min");
      result.suggestions.push(`Forecast: ${result.estimatedBGAt30m.toFixed(1)} at 30 min`);
    }
  }

  // Pull target fuel rate for category
  const fuelData = bgModel.targetFuelRates.find((f) => f.category === category);
  if (fuelData) {
    result.targetFuel = fuelData.targetFuelRate;
    result.suggestions.push(`Take ${fuelData.targetFuelRate}g carbs/h`);
  } else {
    // Fall back to category avg fuel rate
    const catData = bgModel.categories[category];
    if (catData?.avgFuelRate) {
      result.targetFuel = Math.round(catData.avgFuelRate);
      result.suggestions.push(`Take ${result.targetFuel}g carbs/h`);
    }
  }

  return result;
}

export function formatGuidancePush(
  guidance: PreRunGuidance,
  currentBG: number,
): { title: string; body: string } {
  const labels: Record<ReadinessLevel, string> = {
    ready: "Ready to run",
    caution: "Heads up",
    wait: "Hold on",
  };
  const title = `${labels[guidance.level]} — ${currentBG.toFixed(1)} mmol/L`;
  const parts = [...guidance.reasons, ...guidance.suggestions].slice(0, 3);
  const body = parts.length > 0 ? parts.join(". ") : "Check your pre-run status";
  return { title, body };
}

export function assessReadiness(input: PreRunInput): PreRunGuidance {
  const bg = assessBGLevel(input.currentBG);
  const trend = assessTrendSlope(input.trendSlope);
  const model = assessModel(input.currentBG, input.trendSlope, input.bgModel, input.category);

  const level = worst(worst(bg.level, trend.level), model.level);

  // Aggregate reasons and suggestions, max 3 each
  const reasons = [...bg.reasons, ...trend.reasons, ...model.reasons].slice(0, 3);
  const suggestions = [...bg.suggestions, ...trend.suggestions, ...model.suggestions].slice(0, 3);

  // Add stability reason for ready state
  if (bg.level === "ready" && trend.level === "ready" && reasons.length === 0) {
    reasons.push("BG stable");
  }

  return {
    level,
    reasons,
    suggestions,
    predictedDrop: model.predictedDrop,
    targetFuel: model.targetFuel,
    estimatedBGAt30m: model.estimatedBGAt30m,
  };
}