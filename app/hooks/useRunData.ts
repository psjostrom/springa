"use client";

import { useMemo } from "react";
import { buildBGModelFromCached } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";
import type { BGReading } from "@/lib/cgm";
import { buildRunBGContexts } from "@/lib/runBGContext";
import { enrichWithGlucose } from "@/lib/bgAlignment";
import { useStreamCache } from "./useStreamCache";

export function useRunData(
  apiKey: string,
  enabled: boolean,
  sharedEvents: CalendarEvent[],
  bgReadings?: BGReading[],
) {
  // 1. Filter and sort completed runs — cache all of them.
  //    BG model and pace calibration apply their own time windows downstream.
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
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [sharedEvents],
  );

  // 2. Stream cache (async infrastructure)
  const { cached, loading, progress } = useStreamCache(apiKey, enabled, completedRuns);

  // 2.5. Reconstruct glucose from CGM readings
  const glucoseEnriched = useMemo(
    () => enrichWithGlucose(cached, bgReadings ?? []),
    [cached, bgReadings],
  );

  // 3. Activity name map
  const bgActivityNames = useMemo(
    () => new Map(completedRuns.map((e) => [e.activityId, e.name])),
    [completedRuns],
  );

  // 4. RunBGContexts from CGM readings
  const runBGContexts = useMemo(
    () =>
      bgReadings && bgReadings.length > 0 && completedRuns.length > 0
        ? buildRunBGContexts(completedRuns, bgReadings)
        : new Map<string, never>(),
    [completedRuns, bgReadings],
  );

  // 5. Enrich cached activities with RunBGContext (immutable)
  const cachedActivities = useMemo(
    () =>
      runBGContexts.size > 0
        ? glucoseEnriched.map((c) => {
            const ctx = runBGContexts.get(c.activityId);
            return ctx ? { ...c, runBGContext: ctx } : c;
          })
        : glucoseEnriched,
    [glucoseEnriched, runBGContexts],
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
