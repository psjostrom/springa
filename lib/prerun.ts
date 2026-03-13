import type { WorkoutCategory } from "./types";
import type { BGResponseModel } from "./bgModel";
import { BG_HIGH, BG_EXERCISE_MIN } from "./constants";
import { getCurrentFuelRate } from "./fuelRate";

// --- Types ---

export interface PreRunInput {
  currentBG: number; // mmol/L
  trendSlope: number | null; // mmol/L per 10min (from computeTrend)
  bgModel: BGResponseModel | null;
  category: WorkoutCategory;
  currentTsb?: number | null; // Training Stress Balance (fatigue indicator)
  iob?: number | null; // Insulin on board (units), from MyLife Cloud
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

function assessBGLevel(bg: number): { level: ReadinessLevel; reasons: string[] } {
  if (bg < 4.5) {
    return { level: "wait", reasons: ["BG too low to start"] };
  }
  if (bg < 7.0) {
    return { level: "caution", reasons: ["BG on the low side"] };
  }
  if (bg <= BG_HIGH) {
    return { level: "ready", reasons: [] };
  }
  return { level: "caution", reasons: ["BG high — expect a steeper drop"] };
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
  if (slope <= -0.3) {
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
  bgModel: BGResponseModel | null,
  category: WorkoutCategory,
): { targetFuel: number | null } {
  if (!bgModel || bgModel.activitiesAnalyzed === 0) return { targetFuel: null };
  return { targetFuel: getCurrentFuelRate(category, bgModel) };
}

// Forecast based on current trend — "where will BG be in 30 min?"
// Pure trend projection, independent of exercise model.
function forecast30m(
  currentBG: number,
  trendSlope: number | null,
): { predictedDrop: number | null; estimatedBGAt30m: number | null } {
  if (trendSlope === null) return { predictedDrop: null, estimatedBGAt30m: null };
  const predictedDrop = trendSlope * 3; // trendSlope is mmol/L per 10 min
  return { predictedDrop, estimatedBGAt30m: currentBG + predictedDrop };
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

  // Prioritize actionable suggestions over reasons in push notification
  // Format: [first suggestion] + [first reason] + [second suggestion if room]
  const parts: string[] = [];
  if (guidance.suggestions.length > 0) parts.push(guidance.suggestions[0]);
  if (guidance.reasons.length > 0) parts.push(guidance.reasons[0]);
  if (guidance.suggestions.length > 1) parts.push(guidance.suggestions[1]);

  const body = parts.length > 0 ? parts.slice(0, 3).join(". ") : "Check your pre-run status";
  return { title, body };
}

export function assessReadiness(input: PreRunInput): PreRunGuidance {
  const bg = assessBGLevel(input.currentBG);
  const trend = assessTrendSlope(input.trendSlope);
  const model = assessModel(input.bgModel, input.category);
  const fc = forecast30m(input.currentBG, input.trendSlope);

  let level = worst(bg.level, trend.level);
  let targetFuel = model.targetFuel;

  // --- Pre-run carb calculation (consolidated) ---
  // These factors contribute to pre-run carb needs:
  // 1. Low BG (< 7.0): need carbs to raise BG
  // 2. Compound rule (< 8 AND falling): urgent carb + wait (supersedes low BG)
  // 3. IOB: additional carbs to counteract active insulin (~12g per 1u)

  let preRunCarbs = 0;
  const preRunFactors: string[] = [];
  let waitForTrend = false;

  // Compound rule: BG < 8 AND falling → highest priority, requires wait
  // This supersedes individual "low BG" and "trending down" reasons
  const compoundTriggered = input.currentBG < 8.0 && input.trendSlope !== null && input.trendSlope < -0.3;

  // Build reasons array
  // When compound triggers, skip "BG on the low side" (redundant with compound's "low + falling")
  // but keep trend reasons since "BG dropping fast" is more severe info
  const reasons: string[] = [];
  if (compoundTriggered) {
    level = "wait";
    reasons.push("BG below 8 and falling — high hypo risk");
    preRunCarbs = 20; // upper bound of 15-20g
    preRunFactors.push("low + falling");
    waitForTrend = true;
    // Skip bg.reasons (redundant), but keep trend.reasons (may contain "dropping fast")
    // Filter out "BG trending down" since compound covers it, but keep "BG dropping fast"
    const relevantTrendReasons = trend.reasons.filter((r) => r !== "BG trending down");
    reasons.push(...relevantTrendReasons);
  } else {
    reasons.push(...bg.reasons, ...trend.reasons);
    if (input.currentBG < 4.5) {
      // Actual hypo - use upper bound (20g) and urgent wording
      preRunCarbs = 20;
      preRunFactors.push("hypo");
      waitForTrend = true; // Can't start in hypo, must wait for recovery
    } else if (input.currentBG < 7.0) {
      preRunCarbs = 15;
      preRunFactors.push("low BG");
    }
  }
  // Trend-based hypo warning
  if (fc.estimatedBGAt30m !== null && fc.estimatedBGAt30m < BG_EXERCISE_MIN) {
    level = worst(level, "caution");
    reasons.push("Trend predicts hypo within 30 min");
  }

  // IOB: additional carbs that stack on top
  // ~12g per 1u IOB during exercise, rounded to 5g increments
  if (input.iob != null && input.iob >= 0.5) {
    level = worst(level, "caution");
    reasons.push(`${input.iob.toFixed(1)}u IOB — BG will keep dropping`);
    const iobCarbs = Math.round((input.iob * 12) / 5) * 5;
    preRunCarbs += iobCarbs;
    preRunFactors.push(`${input.iob.toFixed(1)}u IOB`);
  }

  // Fatigue adjustment: TSB < -4 → bump fuel suggestion
  let fatigueBump = 0;
  if (input.currentTsb != null && input.currentTsb < -4) {
    reasons.push("High fatigue — expect steeper BG drops");
    if (targetFuel !== null) {
      fatigueBump = Math.round(targetFuel * 0.2);
      targetFuel += fatigueBump;
    }
  }

  // --- Build suggestions ---
  const suggestions: string[] = [];

  // 1. Pre-run carb suggestion (consolidated)
  if (preRunCarbs > 0) {
    const factorStr = preRunFactors.join(" + ");
    if (waitForTrend) {
      suggestions.push(`Eat ${preRunCarbs}g carbs (${factorStr}) and wait for upward trend`);
    } else {
      suggestions.push(`Have ${preRunCarbs}g carbs (${factorStr}) before starting`);
    }
  }

  // 2. Non-carb trend suggestions (wait for reading, hold off)
  suggestions.push(...trend.suggestions);

  // 3. Trend forecast (informational)
  if (fc.estimatedBGAt30m !== null) {
    suggestions.push(`Forecast: ${fc.estimatedBGAt30m.toFixed(1)} at 30 min`);
  }

  // 4. Fuel suggestion (during-run rate) — always include if available
  if (targetFuel !== null) {
    const fuelText = fatigueBump > 0
      ? `During run: ${targetFuel}g/h (↑${fatigueBump}g for fatigue)`
      : `During run: ${targetFuel}g/h`;
    suggestions.push(fuelText);
  }

  // Add stability reason for ready state
  if (bg.level === "ready" && trend.level === "ready" && reasons.length === 0) {
    reasons.push("BG stable");
  }

  return {
    level,
    reasons: reasons.slice(0, 4),
    suggestions, // No slice — all suggestions are actionable/important
    predictedDrop: fc.predictedDrop,
    targetFuel,
    estimatedBGAt30m: fc.estimatedBGAt30m,
  };
}
