"use client";

import { useState, useEffect, useRef } from "react";
import { startOfMonth, subMonths, endOfMonth } from "date-fns";
import { fetchCalendarData, fetchStreamBatch } from "@/lib/intervalsApi";
import { buildBGModel, type BGResponseModel } from "@/lib/bgModel";
import { getWorkoutCategory } from "@/lib/utils";

const BG_MODEL_MAX_ACTIVITIES = 15;

export function useBGModel(apiKey: string, enabled: boolean) {
  const [bgModel, setBgModel] = useState<BGResponseModel | null>(null);
  const [bgModelLoading, setBgModelLoading] = useState(false);
  const [bgModelProgress, setBgModelProgress] = useState({ done: 0, total: 0 });
  const [bgActivityNames, setBgActivityNames] = useState<Map<string, string>>(new Map());
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!apiKey || !enabled || loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      setBgModelLoading(true);
      try {
        const start = startOfMonth(subMonths(new Date(), 24));
        const end = endOfMonth(new Date());
        const events = await fetchCalendarData(apiKey, start, end, {
          includePairedEvents: true,
        });

        const completedRuns = events
          .filter((e) => e.type === "completed" && e.activityId && e.category !== "other" && e.category !== "race")
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .slice(0, BG_MODEL_MAX_ACTIVITIES);

        if (completedRuns.length === 0) {
          setBgModelLoading(false);
          return;
        }

        setBgModelProgress({ done: 0, total: completedRuns.length });

        const activityIds = completedRuns.map((e) => e.activityId!);
        const streamMap = await fetchStreamBatch(apiKey, activityIds, 3, (done, total) => {
          setBgModelProgress({ done, total });
        });

        const activitiesData = completedRuns
          .filter((e) => streamMap.has(e.activityId!))
          .map((e) => {
            const cat = getWorkoutCategory(e.name);
            return {
              streams: streamMap.get(e.activityId!)!,
              activityId: e.activityId!,
              fuelRate: e.fuelRate ?? null,
              category: cat === "other" ? "easy" as const : cat,
            };
          });

        const model = buildBGModel(activitiesData);
        const nameMap = new Map<string, string>();
        for (const e of completedRuns) {
          if (e.activityId) nameMap.set(e.activityId, e.name);
        }
        setBgActivityNames(nameMap);
        setBgModel(model);
      } catch (err) {
        console.error("useBGModel: build failed", err);
        loadedRef.current = false;
      } finally {
        setBgModelLoading(false);
      }
    })();
  }, [apiKey, enabled]);

  return { bgModel, bgModelLoading, bgModelProgress, bgActivityNames };
}
