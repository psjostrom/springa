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
import { getWorkoutCategory } from "@/lib/utils";

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

export function useBGModel(apiKey: string, enabled: boolean, sharedEvents: CalendarEvent[]) {
  const [bgModel, setBgModel] = useState<BGResponseModel | null>(null);
  const [bgModelLoading, setBgModelLoading] = useState(false);
  const [bgModelProgress, setBgModelProgress] = useState({ done: 0, total: 0 });
  const [bgActivityNames, setBgActivityNames] = useState<Map<string, string>>(new Map());
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

            // Cache even failed alignments (empty arrays) so we don't re-fetch
            newCached.push({
              activityId: e.activityId!,
              category: cat === "other" ? "easy" : cat,
              fuelRate: e.fuelRate ?? null,
              startBG: aligned?.glucose[0]?.value ?? 0,
              glucose: aligned?.glucose ?? [],
              hr: aligned?.hr ?? [],
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
        if (!cancelled) setBgModel(model);
      } catch (err) {
        console.error("useBGModel: build failed", err);
        loadedRef.current = false;
      } finally {
        if (!cancelled) setBgModelLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [apiKey, enabled, sharedEvents]);

  return { bgModel, bgModelLoading, bgModelProgress, bgActivityNames };
}
