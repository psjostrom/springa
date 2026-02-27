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
 */
export function getCurrentFuelRate(
  category: WorkoutCategory,
  bgModel: BGResponseModel | null | undefined,
): number {
  if (bgModel) {
    const target = bgModel.targetFuelRates.find((t) => t.category === category);
    if (target) return Math.round(target.targetFuelRate);
    const avg = bgModel.categories[category]?.avgFuelRate;
    if (avg != null) return Math.round(avg);
  }
  return DEFAULT_FUEL[category];
}
