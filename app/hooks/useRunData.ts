"use client";

import { useMemo } from "react";
import { buildBGModelFromCached } from "@/lib/bgModel";
import { BG_MODEL_MAX_ACTIVITIES } from "@/lib/bgCache";
import type { CalendarEvent } from "@/lib/types";
import type { XdripReading } from "@/lib/xdrip";
import { buildRunBGContexts } from "@/lib/runBGContext";
import { useStreamCache } from "./useStreamCache";

export function useRunData(
  apiKey: string,
  enabled: boolean,
  sharedEvents: CalendarEvent[],
  xdripReadings?: XdripReading[],
) {
  // 1. Filter, sort, slice completed runs — memoized so downstream
  //    values (bgActivityNames, runBGContexts) don't recreate on every
  //    BG poll cycle when sharedEvents hasn't actually changed.
  const completedRuns = useMemo(
    () =>
      sharedEvents
        .filter(
          (e): e is CalendarEvent & { activityId: string } =>
            e.type === "completed" &&
            !!e.activityId &&
            e.category !== "other" &&
            e.category !== "race",
        )
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, BG_MODEL_MAX_ACTIVITIES),
    [sharedEvents],
  );

  // 2. Stream cache (async infrastructure)
  const { cached, loading, progress } = useStreamCache(apiKey, enabled, completedRuns);

  // 3. Activity name map
  const bgActivityNames = useMemo(
    () => new Map(completedRuns.map((e) => [e.activityId, e.name])),
    [completedRuns],
  );

  // 4. RunBGContexts from xDrip readings
  const runBGContexts = useMemo(
    () =>
      xdripReadings && xdripReadings.length > 0 && completedRuns.length > 0
        ? buildRunBGContexts(completedRuns, xdripReadings)
        : new Map<string, never>(),
    [completedRuns, xdripReadings],
  );

  // 5. Enrich cached activities with RunBGContext (immutable)
  const cachedActivities = useMemo(
    () =>
      runBGContexts.size > 0
        ? cached.map((c) => {
            const ctx = runBGContexts.get(c.activityId);
            return ctx ? { ...c, runBGContext: ctx } : c;
          })
        : cached,
    [cached, runBGContexts],
  );

  // 6. Build BG model
  const bgModel = useMemo(
    () =>
      cachedActivities.length > 0
        ? buildBGModelFromCached(cachedActivities)
        : null,
    [cachedActivities],
  );

  return {
    bgModel,
    bgModelLoading: loading,
    bgModelProgress: progress,
    bgActivityNames,
    runBGContexts,
    cachedActivities,
  };
}
