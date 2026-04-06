import type { WorkoutCategory } from "./types";
import type { BGResponseModel } from "./bgModel";

export const DEFAULT_FUEL: Record<WorkoutCategory, number> = {
  easy: 60,
  long: 60,
  interval: 60,
};

/**
 * Single canonical resolution for fuel rate (g/h) by workout category.
 * Priority: BG model target → category average → default (60).
 * Returns 0 when diabetesMode is explicitly false.
 */
export function getCurrentFuelRate(
  category: WorkoutCategory,
  bgModel: BGResponseModel | null | undefined,
  diabetesMode?: boolean,
): number {
  // When diabetes mode is explicitly off, skip fuel entirely
  if (diabetesMode === false) return 0;

  if (bgModel) {
    const target = bgModel.targetFuelRates.find((t) => t.category === category);
    if (target) return Math.round(target.targetFuelRate);
    const avg = bgModel.categories[category]?.avgFuelRate;
    if (avg != null) return Math.round(avg);
  }
  return DEFAULT_FUEL[category];
}

/**
 * Resolve the confidence level for a category's fuel rate.
 * Returns the confidence from the BG model target, or null if
 * the fuel rate didn't come from a model target (category avg or default).
 */
export function getFuelConfidence(
  category: WorkoutCategory,
  bgModel: BGResponseModel | null | undefined,
): "low" | "medium" | "high" | null {
  if (!bgModel) return null;
  const target = bgModel.targetFuelRates.find((t) => t.category === category);
  if (target) return target.confidence;
  return null;
}
