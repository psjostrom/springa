"use client";

import { useState, useEffect, useMemo } from "react";
import { subDays, addDays, startOfDay } from "date-fns";
import { fetchCalendarData } from "@/lib/intervalsApi";
import { computeFitnessData, computeInsights } from "@/lib/fitness";
import { buildSystemPrompt } from "@/lib/coachContext";
import type { BGResponseModel } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";
import type { FitnessInsights } from "@/lib/fitness";

interface UseCoachDataOptions {
  apiKey: string;
  phaseInfo: { name: string; week: number; progress: number };
  bgModel: BGResponseModel | null;
}

export function useCoachData({ apiKey, phaseInfo, bgModel }: UseCoachDataOptions) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [insights, setInsights] = useState<FitnessInsights | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch events once on mount
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const today = startOfDay(new Date());
        const start = subDays(today, 365);
        const end = addDays(today, 30);

        const fetched = await fetchCalendarData(apiKey, start, end);
        const fitnessData = computeFitnessData(fetched, 365);

        setEvents(fetched);
        setInsights(computeInsights(fitnessData, fetched));
      } catch (err) {
        console.error("useCoachData: failed to load", err);
        setEvents([]);
        setInsights(null);
      } finally {
        setIsLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild prompt when bgModel or events change
  const context = useMemo(() => {
    if (events === null) return "";
    return buildSystemPrompt({
      phaseInfo,
      insights,
      bgModel,
      events,
    });
  }, [events, insights, bgModel, phaseInfo]);

  return { context, isLoading };
}
