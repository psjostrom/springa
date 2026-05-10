import type { RunForFloorAnalysis } from "./personalHypoFloor";
import type { CachedActivity } from "./activityStreamsDb";

/**
 * Build RunForFloorAnalysis[] from CachedActivity[] (glucose-enriched activities).
 * Filters to runs with glucose data (>0 startBG), consistent with runAnalysisContext
 * logic that applies `bgSummary.startBG > 0`.
 */
export function buildPastRunsFromActivities(activities: CachedActivity[]): RunForFloorAnalysis[] {
  return activities.flatMap((a): RunForFloorAnalysis[] => {
    const glucose = a.glucose;
    if (!glucose || glucose.length === 0) return [];
    const startBG = glucose[0].value;
    if (startBG <= 0) return []; // consistency with runAnalysisContext
    return [{
      startBG,
      wentHypo: glucose.some((g) => g.value < 4.0),
    }];
  });
}
