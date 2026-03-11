"use client";

import { useState, useEffect, useRef } from "react";
import { fetchStreamBatch } from "@/lib/intervalsApi";
import { extractHRStream, extractExtraStreams, extractRawStreams } from "@/lib/streams";
import {
  readLocalCache,
  writeLocalCache,
  fetchBGCache,
  saveBGCacheRemote,
} from "@/lib/activityStreamsCache";
import type { CachedActivity } from "@/lib/activityStreamsDb";
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

          // Fetch streams for HR, pace, cadence, altitude
          const uncachedIds = uncachedRuns.map((e) => e.activityId);
          const streamMap = await fetchStreamBatch(apiKey, uncachedIds, 3, (done, total) => {
            if (!aborted()) setProgress({ done, total });
          });
          if (aborted()) return;

          // Process each run: extract streams (glucose reconstructed later in useRunData)
          for (const e of uncachedRuns) {
            if (aborted()) return;

            const streams = streamMap.get(e.activityId);
            const hrPoints = streams ? extractHRStream(streams) : [];
            const extra = streams ? extractExtraStreams(streams) : { pace: [], cadence: [], altitude: [] };
            const rawStreams = streams ? extractRawStreams(streams) : { distance: [], time: [] };
            const cat = getWorkoutCategory(e.name);

            newCached.push({
              activityId: e.activityId,
              name: e.name,
              category: cat === "other" ? "easy" : cat,
              fuelRate: e.fuelRate ?? null,
              hr: hrPoints,
              pace: extra.pace,
              cadence: extra.cadence,
              altitude: extra.altitude,
              activityDate: e.date.toISOString().slice(0, 10),
              runStartMs: e.date.getTime(),
              distance: rawStreams.distance.length > 0 ? rawStreams.distance : undefined,
              rawTime: rawStreams.time.length > 0 ? rawStreams.time : undefined,
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
