"use client";

import { useState, useEffect, useRef } from "react";
import { fetchStreamBatch } from "@/lib/intervalsApi";
import {
  alignStreams,
  buildBGModelFromCached,
  type BGResponseModel,
} from "@/lib/bgModel";
import { extractExtraStreams } from "@/lib/streams";
import {
  BG_MODEL_MAX_ACTIVITIES,
  readLocalCache,
  writeLocalCache,
  fetchBGCache,
  saveBGCacheRemote,
} from "@/lib/bgCache";
import type { CachedActivity } from "@/lib/bgCacheDb";
import type { CalendarEvent } from "@/lib/types";
import type { XdripReading } from "@/lib/xdrip";
import { getWorkoutCategory } from "@/lib/constants";
import { buildRunBGContexts, type RunBGContext } from "@/lib/runBGContext";

export function useBGModel(apiKey: string, enabled: boolean, sharedEvents: CalendarEvent[], xdripReadings?: XdripReading[]) {
  const [bgModel, setBgModel] = useState<BGResponseModel | null>(null);
  const [bgModelLoading, setBgModelLoading] = useState(false);
  const [bgModelProgress, setBgModelProgress] = useState({ done: 0, total: 0 });
  const [bgActivityNames, setBgActivityNames] = useState<Map<string, string>>(new Map());
  const [runBGContexts, setRunBGContexts] = useState<Map<string, RunBGContext>>(new Map());
  const [completedRuns, setCompletedRuns] = useState<CalendarEvent[]>([]);
  const [cachedActivities, setCachedActivities] = useState<CachedActivity[]>([]);
  const loadedRef = useRef(false);

  // L1: instant render from localStorage (once)
  const l1DoneRef = useRef(false);
  useEffect(() => {
    if (l1DoneRef.current) return;
    l1DoneRef.current = true;
    const local = readLocalCache();
    if (local.length > 0) {
      const model = buildBGModelFromCached(local);
      if (model.activitiesAnalyzed > 0) setBgModel(model);
    }
  }, []);

  useEffect(() => {
    if (!apiKey || !enabled || loadedRef.current || sharedEvents.length === 0) return;
    loadedRef.current = true;
    let cancelled = false;

    void (async () => {
      setBgModelLoading(true);
      try {
        const runs = sharedEvents
          .filter((e): e is CalendarEvent & { activityId: string } => e.type === "completed" && !!e.activityId && e.category !== "other" && e.category !== "race")
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .slice(0, BG_MODEL_MAX_ACTIVITIES);

        if (runs.length === 0) {
          setBgModelLoading(false);
          return;
        }

        // Build name map
        const nameMap = new Map<string, string>();
        for (const e of runs) {
          if (e.activityId) nameMap.set(e.activityId, e.name);
        }
        setBgActivityNames(nameMap);

        const wantedIds = new Set(runs.map((e) => e.activityId));

        // Fetch cache
        const cached = await fetchBGCache();
        if (cancelled) return; // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- mutated in cleanup

        const cachedMap = new Map(
          cached
            .filter((c) => wantedIds.has(c.activityId))
            .map((c) => [c.activityId, c]),
        );

        // Diff: find uncached activity IDs
        const uncachedRuns = runs.filter(
          (e) => !cachedMap.has(e.activityId),
        );

        const newCached: CachedActivity[] = [];

        if (uncachedRuns.length > 0) {
          setBgModelProgress({ done: 0, total: uncachedRuns.length });

          const uncachedIds = uncachedRuns.map((e) => e.activityId);
          const streamMap = await fetchStreamBatch(apiKey, uncachedIds, 3, (done, total) => {
            if (!cancelled) setBgModelProgress({ done, total });
          });
          if (cancelled) return; // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- mutated in cleanup

          for (const e of uncachedRuns) {
            const streams = streamMap.get(e.activityId);
            const aligned = streams ? alignStreams(streams) : null;
            const cat = getWorkoutCategory(e.name);
            const extra = streams ? extractExtraStreams(streams) : { pace: [], cadence: [], altitude: [] };

            // Cache even failed alignments (empty arrays) so we don't re-fetch
            newCached.push({
              activityId: e.activityId,
              category: cat === "other" ? "easy" : cat,
              fuelRate: e.fuelRate ?? null,
              startBG: aligned?.glucose[0]?.value ?? 0,
              glucose: aligned?.glucose ?? [],
              hr: aligned?.hr ?? [],
              pace: extra.pace,
              cadence: extra.cadence,
              altitude: extra.altitude,
              activityDate: e.date.toISOString().slice(0, 10),
            });
          }
        }

        // Merge: cached (still relevant) + newly fetched
        const allCached = [...cachedMap.values(), ...newCached];

        // Save merged cache (fire and forget)
        if (newCached.length > 0) {
          writeLocalCache(allCached);
          void saveBGCacheRemote(allCached);
        }

        // Build model from all cached data
        const model = buildBGModelFromCached(allCached);
        if (!cancelled) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- mutated in cleanup
          setBgModel(model);
          setCachedActivities(allCached);
          setCompletedRuns(runs);
        }
      } catch (err) {
        console.error("useBGModel: build failed", err);
        loadedRef.current = false;
      } finally {
        if (!cancelled) setBgModelLoading(false); // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- mutated in cleanup
      }
    })();

    return () => { cancelled = true; };
  }, [apiKey, enabled, sharedEvents]);

  // Compute RunBGContexts when both completed runs and xDrip readings are available
  useEffect(() => {
    if (!xdripReadings || xdripReadings.length === 0 || completedRuns.length === 0) return;

    const contexts = buildRunBGContexts(completedRuns, xdripReadings);
    setRunBGContexts(contexts);

    // Enrich cached activities with RunBGContext and rebuild model
    for (const c of cachedActivities) {
      const ctx = contexts.get(c.activityId);
      if (ctx) c.runBGContext = ctx;
    }
    const model = buildBGModelFromCached(cachedActivities);
    setBgModel(model);
  }, [xdripReadings, completedRuns, cachedActivities]);

  return { bgModel, bgModelLoading, bgModelProgress, bgActivityNames, runBGContexts, cachedActivities };
}
