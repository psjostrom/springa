"use client";

import { useState, useEffect, useRef } from "react";
import { fetchStreamBatch } from "@/lib/intervalsApi";
import {
  alignStreams,
  buildBGModelFromCached,
  type BGResponseModel,
} from "@/lib/bgModel";
import type { CachedActivity } from "@/lib/settings";
import type { CalendarEvent } from "@/lib/types";
import type { XdripReading } from "@/lib/xdrip";
import type { IntervalsStream, DataPoint } from "@/lib/types";
import { getWorkoutCategory } from "@/lib/utils";
import { buildRunBGContexts, type RunBGContext } from "@/lib/runBGContext";

/** Extract minute-indexed pace/cadence/altitude DataPoints from raw streams. */
export function extractExtraStreams(streams: IntervalsStream[]): {
  pace: DataPoint[];
  cadence: DataPoint[];
  altitude: DataPoint[];
} {
  let timeData: number[] = [];
  let velocityRaw: number[] = [];
  let cadenceRaw: number[] = [];
  let altitudeRaw: number[] = [];

  for (const s of streams) {
    if (s.type === "time") timeData = s.data;
    if (s.type === "velocity_smooth") velocityRaw = s.data;
    if (s.type === "cadence") cadenceRaw = s.data;
    if (s.type === "altitude") altitudeRaw = s.data;
  }

  const pace: DataPoint[] = [];
  const cadence: DataPoint[] = [];
  const altitude: DataPoint[] = [];

  if (timeData.length === 0) return { pace, cadence, altitude };

  // Build minute-indexed maps (same pattern as alignStreams)
  const paceByMin = new Map<number, number[]>();
  const cadByMin = new Map<number, number[]>();
  const altByMin = new Map<number, number[]>();

  for (let i = 0; i < timeData.length; i++) {
    const minute = Math.round(timeData[i] / 60);

    if (i < velocityRaw.length && velocityRaw[i] > 0) {
      const p = 1000 / (velocityRaw[i] * 60); // m/s → min/km
      if (p >= 2.0 && p <= 12.0) {
        const arr = paceByMin.get(minute) ?? [];
        arr.push(p);
        paceByMin.set(minute, arr);
      }
    }

    if (i < cadenceRaw.length && cadenceRaw[i] > 0) {
      const arr = cadByMin.get(minute) ?? [];
      arr.push(cadenceRaw[i] * 2); // half-cadence → SPM
      cadByMin.set(minute, arr);
    }

    if (i < altitudeRaw.length) {
      const arr = altByMin.get(minute) ?? [];
      arr.push(altitudeRaw[i]);
      altByMin.set(minute, arr);
    }
  }

  // Average per minute
  for (const [min, vals] of paceByMin) {
    pace.push({ time: min, value: vals.reduce((a, b) => a + b, 0) / vals.length });
  }
  for (const [min, vals] of cadByMin) {
    cadence.push({ time: min, value: vals.reduce((a, b) => a + b, 0) / vals.length });
  }
  for (const [min, vals] of altByMin) {
    altitude.push({ time: min, value: vals.reduce((a, b) => a + b, 0) / vals.length });
  }

  pace.sort((a, b) => a.time - b.time);
  cadence.sort((a, b) => a.time - b.time);
  altitude.sort((a, b) => a.time - b.time);

  return { pace, cadence, altitude };
}

const BG_MODEL_MAX_ACTIVITIES = 15;
const LS_KEY = "bgcache";

function readLocalCache(): CachedActivity[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalCache(data: CachedActivity[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded — non-critical
  }
}

async function fetchBGCache(): Promise<CachedActivity[]> {
  try {
    const res = await fetch("/api/bg-cache");
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function saveBGCacheRemote(data: CachedActivity[]): Promise<void> {
  try {
    await fetch("/api/bg-cache", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    // non-critical — next visit will rebuild
  }
}

export function useBGModel(apiKey: string, enabled: boolean, sharedEvents: CalendarEvent[], xdripReadings?: XdripReading[]) {
  const [bgModel, setBgModel] = useState<BGResponseModel | null>(null);
  const [bgModelLoading, setBgModelLoading] = useState(false);
  const [bgModelProgress, setBgModelProgress] = useState({ done: 0, total: 0 });
  const [bgActivityNames, setBgActivityNames] = useState<Map<string, string>>(new Map());
  const [runBGContexts, setRunBGContexts] = useState<Map<string, RunBGContext>>(new Map());
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

    (async () => {
      setBgModelLoading(true);
      try {
        const completedRuns = sharedEvents
          .filter((e) => e.type === "completed" && e.activityId && e.category !== "other" && e.category !== "race")
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .slice(0, BG_MODEL_MAX_ACTIVITIES);

        if (completedRuns.length === 0) {
          setBgModelLoading(false);
          return;
        }

        // Build name map
        const nameMap = new Map<string, string>();
        for (const e of completedRuns) {
          if (e.activityId) nameMap.set(e.activityId, e.name);
        }
        setBgActivityNames(nameMap);

        const wantedIds = new Set(completedRuns.map((e) => e.activityId!));

        // Fetch cache
        const cached = await fetchBGCache();
        if (cancelled) return;

        const cachedMap = new Map(
          cached
            .filter((c) => wantedIds.has(c.activityId))
            .map((c) => [c.activityId, c]),
        );

        // Diff: find uncached activity IDs
        const uncachedRuns = completedRuns.filter(
          (e) => !cachedMap.has(e.activityId!),
        );

        const newCached: CachedActivity[] = [];

        if (uncachedRuns.length > 0) {
          setBgModelProgress({ done: 0, total: uncachedRuns.length });

          const uncachedIds = uncachedRuns.map((e) => e.activityId!);
          const streamMap = await fetchStreamBatch(apiKey, uncachedIds, 3, (done, total) => {
            if (!cancelled) setBgModelProgress({ done, total });
          });
          if (cancelled) return;

          for (const e of uncachedRuns) {
            const streams = streamMap.get(e.activityId!);
            const aligned = streams ? alignStreams(streams) : null;
            const cat = getWorkoutCategory(e.name);
            const extra = streams ? extractExtraStreams(streams) : { pace: [], cadence: [], altitude: [] };

            // Cache even failed alignments (empty arrays) so we don't re-fetch
            newCached.push({
              activityId: e.activityId!,
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
          saveBGCacheRemote(allCached);
        }

        // Build model from all cached data
        const model = buildBGModelFromCached(allCached);
        if (!cancelled) {
          setBgModel(model);
          cachedRef.current = allCached;
          completedRunsRef.current = completedRuns;
        }
      } catch (err) {
        console.error("useBGModel: build failed", err);
        loadedRef.current = false;
      } finally {
        if (!cancelled) setBgModelLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [apiKey, enabled, sharedEvents]);

  // Compute RunBGContexts separately so xdripReadings updates trigger recomputation
  const cachedRef = useRef<CachedActivity[]>([]);
  const completedRunsRef = useRef<CalendarEvent[]>([]);

  useEffect(() => {
    if (!xdripReadings || xdripReadings.length === 0 || completedRunsRef.current.length === 0) return;

    const contexts = buildRunBGContexts(completedRunsRef.current, xdripReadings);
    setRunBGContexts(contexts);

    // Enrich cached activities with RunBGContext and rebuild model
    const allCached = cachedRef.current;
    for (const c of allCached) {
      const ctx = contexts.get(c.activityId);
      if (ctx) c.runBGContext = ctx;
    }
    const model = buildBGModelFromCached(allCached);
    setBgModel(model);
  }, [xdripReadings]);

  return { bgModel, bgModelLoading, bgModelProgress, bgActivityNames, runBGContexts, cachedActivities: cachedRef.current };
}
