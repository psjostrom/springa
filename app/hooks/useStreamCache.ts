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
  const cachedRef = useRef<CachedActivity[]>([]);
  const runSnapshotRef = useRef<CompletedRun[]>(runs);
  const runCacheKey = runs
    .map((run) => `${run.activityId}:${run.date.getTime()}:${run.name}`)
    .join("|");

  const setCachedState = (next: CachedActivity[]) => {
    cachedRef.current = next;
    setCached(next);
  };

  useEffect(() => {
    runSnapshotRef.current = runs;
  }, [runCacheKey, runs]);

  // L1: instant render from localStorage (once)
  const l1DoneRef = useRef(false);
  useEffect(() => {
    if (l1DoneRef.current) return;
    l1DoneRef.current = true;
    const local = readLocalCache();
    if (local.length > 0) setCachedState(local);
  }, []);

  // L2: fetch remote cache, diff, fetch uncached streams, merge, save
  useEffect(() => {
    const runSnapshot = runSnapshotRef.current;
    if (!enabled || runSnapshot.length === 0) return;
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;

    void (async () => {
      setLoading(true);
      try {
        const wantedIds = new Set(runSnapshot.map((e) => e.activityId));

        const remoteCached = await fetchBGCache();
        if (aborted()) return;

        const cachedMap = new Map<string, CachedActivity>();
        for (const entry of cachedRef.current) {
          if (wantedIds.has(entry.activityId)) {
            cachedMap.set(entry.activityId, entry);
          }
        }
        for (const entry of remoteCached) {
          if (wantedIds.has(entry.activityId) && !cachedMap.has(entry.activityId)) {
            cachedMap.set(entry.activityId, entry);
          }
        }

        const uncachedRuns = runSnapshot.filter(
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

          // Extract streams for each run and collect BG time windows
          const runData = uncachedRuns.map((e) => {
            const streams = allStreams.get(e.activityId);
            const hrPoints = streams ? extractHRStream(streams) : [];
            const extra = streams ? extractExtraStreams(streams) : { pace: [], cadence: [], altitude: [] };
            const rawS = streams ? extractRawStreams(streams) : { distance: [], time: [] };
            const cat = getWorkoutCategory(e.name);
            const runStartMs = e.date.getTime();
            const lastMin = hrPoints.length > 0 ? hrPoints[hrPoints.length - 1].time : 0;
            const runEndMs = runStartMs + lastMin * 60 * 1000;
            return { activityId: e.activityId, hrPoints, extra, rawStreams: rawS, cat, runStartMs, runEndMs };
          });

          // Batch-fetch BG for all runs in one request
          const bgWindows = runData
            .filter((r) => r.hrPoints.length > 0 && r.runEndMs > r.runStartMs)
            .map((r) => ({ activityId: r.activityId, start: r.runStartMs, end: r.runEndMs }));

          const bgMap = new Map<string, BGReading[]>();
          if (bgWindows.length > 0) {
            try {
              const bgRes = await fetch("/api/bg/runs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ windows: bgWindows }),
              });
              if (bgRes.ok) {
                const bgData = (await bgRes.json()) as { readings?: Record<string, BGReading[]> };
                if (bgData.readings) {
                  for (const [id, r] of Object.entries(bgData.readings)) {
                    bgMap.set(id, r);
                  }
                }
              }
            } catch (err) {
              console.warn("[useStreamCache] Batch BG fetch failed:", err);
            }
          }
          if (aborted()) return;

          for (let i = 0; i < uncachedRuns.length; i++) {
            const e = uncachedRuns[i];
            const rd = runData[i];

            let glucose: DataPoint[] | undefined;
            const readings = bgMap.get(e.activityId);
            if (readings && readings.length >= 2) {
              const aligned = alignHRWithBG(rd.hrPoints, readings, rd.runStartMs);
              if (aligned) glucose = aligned.glucose;
            } else if (rd.hrPoints.length > 0 && rd.runEndMs > rd.runStartMs && !readings) {
              bgFailedIds.add(e.activityId);
            }

            newCached.push({
              activityId: e.activityId,
              name: e.name,
              category: rd.cat === "other" ? "easy" : rd.cat,
              fuelRate: e.fuelRate ?? null,
              hr: rd.hrPoints,
              pace: rd.extra.pace,
              cadence: rd.extra.cadence,
              altitude: rd.extra.altitude,
              activityDate: e.date.toISOString().slice(0, 10),
              runStartMs: rd.runStartMs,
              distance: rd.rawStreams.distance.length > 0 ? rd.rawStreams.distance : undefined,
              rawTime: rd.rawStreams.time.length > 0 ? rd.rawStreams.time : undefined,
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
          void saveBGCacheRemote(toPersist).then((saved) => {
            if (!saved) {
              console.error("useStreamCache: remote cache save failed");
            }
          });
        }

        if (!aborted()) setCachedState(allCached);
      } catch (err) {
        console.error("useStreamCache: fetch failed", err);
      } finally {
        if (!aborted()) setLoading(false);
      }
    })();

    return () => { controller.abort(); };
  }, [enabled, runCacheKey]);

  return { cached, loading, progress };
}
