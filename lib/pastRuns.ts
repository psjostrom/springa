import type { RunForFloorAnalysis } from "./personalHypoFloor";
import type { CachedActivity } from "./activityStreamsDb";
import { getActivityStartBG } from "./activityBG";

/**
 * Build RunForFloorAnalysis[] from CachedActivity[] (glucose-enriched activities).
 * Filters to runs with a valid CGM start BG (>0). Resolution prefers
 * runBGContext.pre.startBG (closest reading to run start) and falls back to
 * the first glucose stream sample.
 */
export function buildPastRunsFromActivities(activities: CachedActivity[]): RunForFloorAnalysis[] {
  return activities.flatMap((a): RunForFloorAnalysis[] => {
    const glucose = a.glucose;
    if (!glucose || glucose.length === 0) return [];
    const startBG = getActivityStartBG(a);
    if (startBG == null || startBG <= 0) return [];
    return [{
      startBG,
      wentHypo: glucose.some((g) => g.value < 4.0),
    }];
  });
}
