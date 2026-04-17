"use client";

import { useState, useEffect, useRef } from "react";
import { fetchStreams } from "@/lib/intervalsClient";
import { extractHRStream, extractExtraStreams, extractRawStreams } from "@/lib/streams";
import {
  readLocalCache,
  writeLocalCache,
  fetchBGCache,
  saveBGCacheRemote,
} from "@/lib/activityStreamsCache";
import type { CachedActivity } from "@/lib/activityStreamsDb";
import type { CalendarEvent, IntervalsStream, DataPoint } from "@/lib/types";
import type { BGReading } from "@/lib/cgm";
import { alignHRWithBG } from "@/lib/bgAlignment";
import { getWorkoutCategory } from "@/lib/constants";

type CompletedRun = CalendarEvent & { activityId: string };

const BATCH_SIZE = 5;

export function useStreamCache(
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
    if (!enabled || loadedRef.current || runs.length === 0) return;
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
        const bgFailedIds = new Set<string>();

        if (uncachedRuns.length > 0) {
          setProgress({ done: 0, total: uncachedRuns.length });

          // Fetch streams for HR, pace, cadence, altitude
          const uncachedIds = uncachedRuns.map((e) => e.activityId);
          const allStreams = new Map<string, IntervalsStream[]>();
          for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
            if (aborted()) return;
            const batch = uncachedIds.slice(i, i + BATCH_SIZE);
            const result = await fetchStreams(batch);
            for (const [id, streams] of Object.entries(result)) {
              allStreams.set(id, streams);
            }
            if (!aborted()) setProgress({ done: Math.min(i + BATCH_SIZE, uncachedIds.length), total: uncachedIds.length });
          }
          if (aborted()) return;

          // Process each run: extract streams (glucose reconstructed later in useRunData)
          for (const e of uncachedRuns) {
            if (aborted()) return;

            const streams = allStreams.get(e.activityId);
            const hrPoints = streams ? extractHRStream(streams) : [];
            const extra = streams ? extractExtraStreams(streams) : { pace: [], cadence: [], altitude: [] };
            const rawStreams = streams ? extractRawStreams(streams) : { distance: [], time: [] };
            const cat = getWorkoutCategory(e.name);

            // Fetch BG readings for this run's time window.
            // TODO: sequential per-run fetch — consider batching if cold-start latency is noticeable
            let glucose: DataPoint[] | undefined;
            if (hrPoints.length > 0) {
              const runStartMs = e.date.getTime();
              const lastMin = hrPoints[hrPoints.length - 1].time;
              const runEndMs = runStartMs + lastMin * 60 * 1000;

              if (runEndMs > runStartMs) {
                try {
                  const bgRes = await fetch(`/api/bg/run?start=${runStartMs}&end=${runEndMs}`);
                  if (bgRes.ok) {
                    const bgData = (await bgRes.json()) as { readings?: BGReading[] };
                    if (bgData.readings && bgData.readings.length >= 2) {
                      const aligned = alignHRWithBG(hrPoints, bgData.readings, runStartMs);
                      if (aligned) glucose = aligned.glucose;
                    }
                  } else {
                    bgFailedIds.add(e.activityId);
                  }
                } catch (err) {
                  bgFailedIds.add(e.activityId);
                  console.warn(`[useStreamCache] BG fetch failed for ${e.activityId}:`, err);
                }
              }
            }

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
              glucose,
            });
          }
        }

        const allCached = [...cachedMap.values(), ...newCached];

        if (newCached.length > 0) {
          // Don't persist activities where BG fetch failed — they'll be retried on next load.
          const toPersist = bgFailedIds.size > 0
            ? [...cachedMap.values(), ...newCached.filter(c => !bgFailedIds.has(c.activityId))]
            : allCached;
          writeLocalCache(toPersist);
          void saveBGCacheRemote(toPersist);
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
  }, [enabled, runs]);

  return { cached, loading, progress };
}
