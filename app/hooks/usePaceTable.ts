import { useMemo } from "react";
import type { PaceTable } from "@/lib/types";
import type { CachedActivity } from "@/lib/bgCacheDb";
import { extractZoneSegments, buildCalibratedPaceTable, toPaceTable } from "@/lib/paceCalibration";

/** Derive a calibrated pace table from cached activity stream data. */
export function usePaceTable(cachedActivities: CachedActivity[], lthr?: number): PaceTable | undefined {
  return useMemo(() => {
    if (!lthr || cachedActivities.length === 0) return undefined;
    const allSegments = cachedActivities.flatMap((a) =>
      a.pace && a.pace.length > 0 && a.hr.length > 0
        ? extractZoneSegments(a.hr, a.pace, lthr, a.activityId, a.activityDate ?? "")
        : [],
    );
    if (allSegments.length === 0) return undefined;
    return toPaceTable(buildCalibratedPaceTable(allSegments));
  }, [cachedActivities, lthr]);
}
