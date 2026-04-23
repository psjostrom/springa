"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
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
const EMPTY_PROGRESS = { done: 0, total: 0 };

interface RunData {
  activityId: string;
  hrPoints: DataPoint[];
  extra: ReturnType<typeof extractExtraStreams>;
  rawStreams: ReturnType<typeof extractRawStreams>;
  category: ReturnType<typeof getWorkoutCategory>;
  runStartMs: number;
  runEndMs: number;
}

function buildRunCacheKey(runs: CompletedRun[]): string {
  return runs
    .map((run) => `${run.activityId}:${run.date.getTime()}:${run.name}`)
    .join("|");
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

function compareCachedActivity(a: CachedActivity, b: CachedActivity): number {
  const dateCompare = (b.activityDate ?? "").localeCompare(a.activityDate ?? "");
  if (dateCompare !== 0) return dateCompare;

  const startCompare = (b.runStartMs ?? 0) - (a.runStartMs ?? 0);
  if (startCompare !== 0) return startCompare;

  return a.activityId.localeCompare(b.activityId);
}

function serializeCache(entries: CachedActivity[]): string {
  return JSON.stringify([...entries].sort(compareCachedActivity));
}

function mergeCaches(
  preferred: CachedActivity[],
  fallback: CachedActivity[],
): CachedActivity[] {
  const merged = new Map<string, CachedActivity>();

  for (const entry of fallback) {
    merged.set(entry.activityId, entry);
  }
  for (const entry of preferred) {
    merged.set(entry.activityId, entry);
  }

  return [...merged.values()].sort(compareCachedActivity);
}

function buildVisibleCache(
  runs: CompletedRun[],
  persistedCache: CachedActivity[],
  sessionCache: CachedActivity[],
): CachedActivity[] {
  const persistedMap = new Map(
    persistedCache.map((entry) => [entry.activityId, entry]),
  );
  const sessionMap = new Map(
    sessionCache.map((entry) => [entry.activityId, entry]),
  );

  return runs.flatMap((run) => {
    const entry = sessionMap.get(run.activityId) ?? persistedMap.get(run.activityId);
    return entry ? [entry] : [];
  });
}

function buildRunData(
  run: CompletedRun,
  streams: IntervalsStream[] | undefined,
): RunData {
  const hrPoints = streams ? extractHRStream(streams) : [];
  const extra = streams
    ? extractExtraStreams(streams)
    : { pace: [], cadence: [], altitude: [] };
  const rawStreams = streams
    ? extractRawStreams(streams)
    : { distance: [], time: [], heartrate: [], velocity: [], cadence: [], altitude: [] };
  const category = getWorkoutCategory(run.name);
  const runStartMs = run.date.getTime();
  const lastMinute = hrPoints.length > 0 ? hrPoints[hrPoints.length - 1].time : 0;

  return {
    activityId: run.activityId,
    hrPoints,
    extra,
    rawStreams,
    category,
    runStartMs,
    runEndMs: runStartMs + lastMinute * 60 * 1000,
  };
}

async function fetchBGReadings(
  runData: RunData[],
  signal: AbortSignal,
): Promise<Map<string, BGReading[]> | null> {
  const bgMap = new Map<string, BGReading[]>();
  const windows = runData
    .filter((run) => run.hrPoints.length > 0 && run.runEndMs > run.runStartMs)
    .map((run) => ({
      activityId: run.activityId,
      start: run.runStartMs,
      end: run.runEndMs,
    }));

  if (windows.length === 0) {
    return bgMap;
  }

  try {
    const response = await fetch("/api/bg/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windows }),
    });
    if (signal.aborted) return null;

    if (!response.ok) {
      return bgMap;
    }

    const data = (await response.json()) as {
      readings?: Record<string, BGReading[]>;
    };
    for (const [activityId, readings] of Object.entries(data.readings ?? {})) {
      bgMap.set(activityId, readings);
    }
  } catch (err) {
    console.warn("[useStreamCache] Batch BG fetch failed:", err);
  }

  return bgMap;
}

async function loadUncachedRuns(
  uncachedRuns: CompletedRun[],
  signal: AbortSignal,
  setProgress: (progress: { done: number; total: number }) => void,
): Promise<{
  entries: CachedActivity[];
  bgFailedIds: Set<string>;
} | null> {
  if (uncachedRuns.length === 0) {
    setProgress(EMPTY_PROGRESS);
    return { entries: [], bgFailedIds: new Set<string>() };
  }

  setProgress({ done: 0, total: uncachedRuns.length });

  const allStreams = new Map<string, IntervalsStream[]>();
  const uncachedIds = uncachedRuns.map((run) => run.activityId);
  for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
    if (signal.aborted) return null;

    const batch = uncachedIds.slice(i, i + BATCH_SIZE);
    const result = await fetchStreams(batch);
    for (const [activityId, streams] of Object.entries(result)) {
      allStreams.set(activityId, streams);
    }

    if (isAborted(signal)) return null;
    setProgress({
      done: Math.min(i + BATCH_SIZE, uncachedIds.length),
      total: uncachedIds.length,
    });
  }
  if (signal.aborted) return null;

  const runData = uncachedRuns.map((run) => buildRunData(run, allStreams.get(run.activityId)));
  const bgMap = await fetchBGReadings(runData, signal);
  if (bgMap === null) return null;

  const bgFailedIds = new Set<string>();
  const entries = uncachedRuns.map((run, index) => {
    const data = runData[index];
    const readings = bgMap.get(run.activityId);

    let glucose: DataPoint[] | undefined;
    if (readings && readings.length >= 2) {
      glucose = alignHRWithBG(data.hrPoints, readings, data.runStartMs)?.glucose;
    } else if (data.hrPoints.length > 0 && data.runEndMs > data.runStartMs && !readings) {
      bgFailedIds.add(run.activityId);
    }

    return {
      activityId: run.activityId,
      name: run.name,
      category: data.category === "other" ? "easy" : data.category,
      fuelRate: run.fuelRate ?? null,
      hr: data.hrPoints,
      pace: data.extra.pace,
      cadence: data.extra.cadence,
      altitude: data.extra.altitude,
      activityDate: run.date.toISOString().slice(0, 10),
      runStartMs: data.runStartMs,
      distance: data.rawStreams.distance.length > 0 ? data.rawStreams.distance : undefined,
      rawTime: data.rawStreams.time.length > 0 ? data.rawStreams.time : undefined,
      glucose,
    } satisfies CachedActivity;
  });

  return { entries, bgFailedIds };
}

export function useStreamCache(
  enabled: boolean,
  runs: CompletedRun[],
) {
  const [persistedCache, setPersistedCache] = useState<CachedActivity[]>([]);
  const [sessionCache, setSessionCache] = useState<CachedActivity[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const runCacheKey = buildRunCacheKey(runs);
  const cached = useMemo(
    () => buildVisibleCache(runs, persistedCache, sessionCache),
    [runs, persistedCache, sessionCache],
  );

  const reconcileCache = useEffectEvent(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const remoteCached = await fetchBGCache();
      if (signal.aborted) return;

      const mergedPersisted = mergeCaches(persistedCache, remoteCached);
      const mergedPersistedMap = new Map(
        mergedPersisted.map((entry) => [entry.activityId, entry]),
      );
      const uncachedRuns = runs.filter(
        (run) => !mergedPersistedMap.has(run.activityId),
      );

      const loaded = await loadUncachedRuns(
        uncachedRuns,
        signal,
        setProgress,
      );
      if (loaded === null) return;

      const sessionEntries = loaded.entries.filter((entry) =>
        loaded.bgFailedIds.has(entry.activityId),
      );
      const persistableEntries = loaded.entries.filter(
        (entry) => !loaded.bgFailedIds.has(entry.activityId),
      );
      const nextPersisted = mergeCaches(persistableEntries, mergedPersisted);

      const currentPersistedSignature = serializeCache(persistedCache);
      const nextPersistedSignature = serializeCache(nextPersisted);
      const remoteSignature = serializeCache(remoteCached);
      const persistedChanged = nextPersistedSignature !== currentPersistedSignature;
      if (persistedChanged) {
        writeLocalCache(nextPersisted);
      }

      const remoteChanged = nextPersistedSignature !== remoteSignature;
      if (remoteChanged) {
        void saveBGCacheRemote(nextPersisted).then((saved) => {
          if (!saved) {
            console.error("useStreamCache: remote cache save failed");
          }
        });
      }

      setSessionCache(sessionEntries);
      if (persistedChanged) {
        setPersistedCache(nextPersisted);
      }
    } catch (err) {
      console.error("useStreamCache: fetch failed", err);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  });

  useEffect(() => {
    setPersistedCache(readLocalCache());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    if (!enabled || runCacheKey.length === 0) {
      setSessionCache([]);
      setLoading(false);
      setProgress(EMPTY_PROGRESS);
      return;
    }

    const controller = new AbortController();

    void reconcileCache(controller.signal);

    return () => {
      controller.abort();
    };
  }, [enabled, hydrated, runCacheKey]);

  return { cached, loading, progress };
}
