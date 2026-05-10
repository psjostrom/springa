import type { MatchableRunWithPost } from "./runOutcomePrediction";
import { predictRunOutcome } from "./runOutcomePrediction";
import { MIN_RATE_SAMPLES } from "./runBGContext";

export interface FuelRecommendation {
  fuelRate: number;
  basis: "evidence" | "limited-evidence";
  predictedP10EndBG: number;
  matchCountAtRate: number;
}

export function recommendFuelRate(
  matches: MatchableRunWithPost[],
  safetyFloor = 4.5,
): FuelRecommendation | null {
  if (matches.length === 0) return null;

  const fuelRates = [
    ...new Set(matches.map((m) => m.fuelRate).filter((r): r is number => r != null)),
  ].sort((a, b) => a - b);

  for (const rate of fuelRates) {
    const subset = matches.filter((m) => m.fuelRate === rate);
    if (subset.length < MIN_RATE_SAMPLES) continue;
    const out = predictRunOutcome(subset);
    if (!out) continue;
    if (out.during.p10EndBG >= safetyFloor) {
      return {
        fuelRate: rate,
        basis: "evidence",
        predictedP10EndBG: out.during.p10EndBG,
        matchCountAtRate: subset.length,
      };
    }
  }

  // No rate clears the floor — fallback to highest tested rate, but only if it
  // has at least MIN_RATE_SAMPLES. Single-data-point fuel recommendations are
  // dangerous in a T1D context.
  if (fuelRates.length === 0) return null;
  const highest = fuelRates[fuelRates.length - 1];
  const subset = matches.filter((m) => m.fuelRate === highest);
  if (subset.length < MIN_RATE_SAMPLES) return null;
  const out = predictRunOutcome(subset);
  if (!out) return null;
  return {
    fuelRate: highest,
    basis: "limited-evidence",
    predictedP10EndBG: out.during.p10EndBG,
    matchCountAtRate: subset.length,
  };
}
