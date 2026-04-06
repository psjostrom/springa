"use client";

import { useMemo } from "react";
import { buildBGModelFromCached } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";
import type { BGReading } from "@/lib/cgm";
import { buildRunBGContexts } from "@/lib/runBGContext";
import { enrichWithGlucose } from "@/lib/bgAlignment";
import { useStreamCache } from "./useStreamCache";

export function useRunData(
  enabled: boolean,
  sharedEvents: CalendarEvent[],
  bgReadings?: BGReading[],
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
            !!e.activityId &&
            e.category !== "other" &&
            e.category !== "race",
        )
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [sharedEvents],
  );

  // 2. Stream cache (async infrastructure)
  const { cached, loading, progress } = useStreamCache(enabled, completedRuns);

  // If sugar mode is off, skip all BG-related enrichment
  const skipBG = diabetesMode === false;

  // 2.5. Reconstruct glucose from CGM readings (skip when sugar mode off)
  const glucoseEnriched = useMemo(
    () => skipBG ? cached : enrichWithGlucose(cached, bgReadings ?? []),
    [cached, bgReadings, skipBG],
  );

  // 3. Activity name map
  const bgActivityNames = useMemo(
    () => skipBG ? new Map() : new Map(completedRuns.map((e) => [e.activityId, e.name])),
    [completedRuns, skipBG],
  );

  // 4. RunBGContexts from CGM readings (skip when sugar mode off)
  const runBGContexts = useMemo(
    () =>
      skipBG || !bgReadings || bgReadings.length === 0 || completedRuns.length === 0
        ? new Map<string, never>()
        : buildRunBGContexts(completedRuns, bgReadings),
    [completedRuns, bgReadings, skipBG],
  );

  // 5. Enrich cached activities with RunBGContext (skip when sugar mode off)
  const cachedActivities = useMemo(
    () =>
      skipBG || runBGContexts.size === 0
        ? glucoseEnriched
        : glucoseEnriched.map((c) => {
            const ctx = runBGContexts.get(c.activityId);
            return ctx ? { ...c, runBGContext: ctx } : c;
          }),
    [glucoseEnriched, runBGContexts, skipBG],
  );

  // 6. Build BG model (skip when sugar mode off)
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
    runBGContexts,
    cachedActivities,
  };
}
