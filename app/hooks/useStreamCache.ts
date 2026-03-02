"use client";

import { useState, useEffect, useRef } from "react";
import { fetchStreamBatch } from "@/lib/intervalsApi";
import { alignStreams } from "@/lib/bgModel";
import { extractExtraStreams } from "@/lib/streams";
import {
  readLocalCache,
  writeLocalCache,
  fetchBGCache,
  saveBGCacheRemote,
} from "@/lib/bgCache";
import type { CachedActivity } from "@/lib/bgCacheDb";
import type { CalendarEvent } from "@/lib/types";
import { getWorkoutCategory } from "@/lib/constants";

type CompletedRun = CalendarEvent & { activityId: string };

export function useStreamCache(
  apiKey: string,
  enabled: boolean,
  runs: CompletedRun[],
) {
  const [cached, setCached] = useState<CachedActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const loadedRef = useRef(false);

  // L1: instant render from localStorage (once)
  const l1DoneRef = useRef(false);
  useEffect(() => {
    if (l1DoneRef.current) return;
    l1DoneRef.current = true;
    const local = readLocalCache();
    if (local.length > 0) setCached(local);
  }, []);

  // L2: fetch remote cache, diff, fetch uncached streams, merge, save
  useEffect(() => {
    if (!apiKey || !enabled || loadedRef.current || runs.length === 0) return;
    loadedRef.current = true;
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;

    void (async () => {
      setLoading(true);
      try {
        const wantedIds = new Set(runs.map((e) => e.activityId));

        const remoteCached = await fetchBGCache();
        if (aborted()) return;

        const cachedMap = new Map(
          remoteCached
            .filter((c) => wantedIds.has(c.activityId))
            .map((c) => [c.activityId, c]),
        );

        const uncachedRuns = runs.filter(
          (e) => !cachedMap.has(e.activityId),
        );

        const newCached: CachedActivity[] = [];

        if (uncachedRuns.length > 0) {
          setProgress({ done: 0, total: uncachedRuns.length });

          const uncachedIds = uncachedRuns.map((e) => e.activityId);
          const streamMap = await fetchStreamBatch(apiKey, uncachedIds, 3, (done, total) => {
            if (!aborted()) setProgress({ done, total });
          });
          if (aborted()) return;

          for (const e of uncachedRuns) {
            const streams = streamMap.get(e.activityId);
            const aligned = streams ? alignStreams(streams) : null;
            const cat = getWorkoutCategory(e.name);
            const extra = streams ? extractExtraStreams(streams) : { pace: [], cadence: [], altitude: [] };

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

        const allCached = [...cachedMap.values(), ...newCached];

        if (newCached.length > 0) {
          writeLocalCache(allCached);
          void saveBGCacheRemote(allCached);
        }

        if (!aborted()) setCached(allCached);
      } catch (err) {
        console.error("useStreamCache: fetch failed", err);
        loadedRef.current = false;
      } finally {
        if (!aborted()) setLoading(false);
      }
    })();

    return () => { controller.abort(); };
  }, [apiKey, enabled, runs]);

  return { cached, loading, progress };
}
