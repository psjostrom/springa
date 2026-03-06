"use client";

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
  // 1. Filter, sort, slice completed runs
  const completedRuns = sharedEvents
    .filter(
      (e): e is CalendarEvent & { activityId: string } =>
        e.type === "completed" &&
        !!e.activityId &&
        e.category !== "other" &&
        e.category !== "race",
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, BG_MODEL_MAX_ACTIVITIES);

  // 2. Stream cache (async infrastructure)
  const { cached, loading, progress } = useStreamCache(apiKey, enabled, completedRuns);

  // 3. Activity name map
  const bgActivityNames = new Map(
    completedRuns.map((e) => [e.activityId, e.name]),
  );

  // 4. RunBGContexts from xDrip readings
  const runBGContexts =
    xdripReadings && xdripReadings.length > 0 && completedRuns.length > 0
      ? buildRunBGContexts(completedRuns, xdripReadings)
      : new Map<string, never>();

  // 5. Enrich cached activities with RunBGContext (immutable)
  const cachedActivities =
    runBGContexts.size > 0
      ? cached.map((c) => {
          const ctx = runBGContexts.get(c.activityId);
          return ctx ? { ...c, runBGContext: ctx } : c;
        })
      : cached;

  // 6. Build BG model
  const bgModel =
    cachedActivities.length > 0
      ? buildBGModelFromCached(cachedActivities)
      : null;

  return {
    bgModel,
    bgModelLoading: loading,
    bgModelProgress: progress,
    bgActivityNames,
    runBGContexts,
    cachedActivities,
  };
}
