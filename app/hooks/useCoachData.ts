"use client";

import { useMemo } from "react";
import { computeFitnessData, computeInsights } from "@/lib/fitness";
import { buildSystemPrompt } from "@/lib/coachContext";
import type { BGResponseModel } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";

interface UseCoachDataOptions {
  events: CalendarEvent[];
  phaseInfo: { name: string; week: number; progress: number };
  bgModel: BGResponseModel | null;
}

export function useCoachData({ events, phaseInfo, bgModel }: UseCoachDataOptions) {
  const insights = useMemo(() => {
    if (events.length === 0) return null;
    const fitnessData = computeFitnessData(events, 365);
    return computeInsights(fitnessData, events);
  }, [events]);

  const context = useMemo(() => {
    if (events.length === 0) return "";
    return buildSystemPrompt({
      phaseInfo,
      insights,
      bgModel,
      events,
    });
  }, [events, insights, bgModel, phaseInfo]);

  return { context, isLoading: events.length === 0 };
}
