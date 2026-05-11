"use client";

import { useMemo } from "react";
import { buildBGModelFromCached } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";
import { useStreamCache } from "./useStreamCache";

export function useRunData(
  enabled: boolean,
  sharedEvents: CalendarEvent[],
  diabetesMode?: boolean,
) {
  // 1. Filter and sort completed runs — cache all of them.
  //    BG model and pace calibration apply their own time windows downstream.
  const completedRuns = useMemo(
    () =>
      sharedEvents
        .filter(
          (e): e is CalendarEvent & { activityId: string } =>
            e.type === "completed" &&
            !!e.activityId,
        )
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [sharedEvents],
  );

  // 2. Stream cache — server-persisted activities (with runBGContext when sugar
  //    mode was on at save time). The cache is the single source of truth.
  const { cached: cachedActivities, loading, progress } = useStreamCache(enabled, completedRuns);

  const skipBG = diabetesMode === false;

  // 3. Activity name map
  const bgActivityNames = useMemo(
    () => skipBG ? new Map() : new Map(completedRuns.map((e) => [e.activityId, e.name])),
    [completedRuns, skipBG],
  );

  // 4. Build BG model from cached activities
  const bgModel = useMemo(
    () =>
      skipBG || cachedActivities.length === 0
        ? null
        : buildBGModelFromCached(cachedActivities),
    [cachedActivities, skipBG],
  );

  return {
    bgModel,
    bgModelLoading: loading,
    bgModelProgress: progress,
    bgActivityNames,
    cachedActivities,
  };
}
