"use client";

import { useMemo } from "react";
import { computeFitnessData, computeInsights } from "@/lib/fitness";
import { buildSystemPrompt } from "@/lib/coachContext";
import type { BGResponseModel } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";
import type { XdripReading } from "@/lib/xdrip";
import type { RunBGContext } from "@/lib/runBGContext";
import type { RunFeedbackRecord } from "@/lib/feedbackDb";

interface UseCoachDataOptions {
  events: CalendarEvent[];
  phaseInfo: { name: string; week: number; progress: number };
  bgModel: BGResponseModel | null;
  raceDate?: string;
  currentBG?: number | null;
  trendSlope?: number | null;
  trendArrow?: string | null;
  lastUpdate?: Date | null;
  readings?: XdripReading[];
  runBGContexts?: Map<string, RunBGContext>;
  recentFeedback?: RunFeedbackRecord[];
}

export function useCoachData({ events, phaseInfo, bgModel, raceDate, currentBG, trendSlope, trendArrow, lastUpdate, readings, runBGContexts, recentFeedback }: UseCoachDataOptions) {
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
      raceDate,
      currentBG,
      trendSlope,
      trendArrow,
      lastUpdate,
      readings,
      runBGContexts,
      recentFeedback,
    });
  }, [events, insights, bgModel, phaseInfo, raceDate, currentBG, trendSlope, trendArrow, lastUpdate, readings, runBGContexts, recentFeedback]);

  return { context, isLoading: events.length === 0 };
}
