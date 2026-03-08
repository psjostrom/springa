"use client";

import { wellnessToFitnessData, computeInsights } from "@/lib/fitness";
import { buildSystemPrompt } from "@/lib/coachContext";
import type { BGResponseModel } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";
import type { XdripReading } from "@/lib/xdrip";
import type { RunBGContext } from "@/lib/runBGContext";
import type { PaceTable } from "@/lib/types";
import type { WellnessEntry } from "@/lib/intervalsApi";

interface UseCoachDataOptions {
  events: CalendarEvent[];
  wellnessEntries: WellnessEntry[];
  phaseInfo: { name: string; week: number; progress: number };
  bgModel: BGResponseModel | null;
  raceDate?: string;
  lthr?: number;
  maxHr?: number;
  hrZones: number[];
  paceTable?: PaceTable;
  currentBG?: number | null;
  trendSlope?: number | null;
  trendArrow?: string | null;
  lastUpdate?: Date | null;
  readings?: XdripReading[];
  runBGContexts?: Map<string, RunBGContext>;
}

export function useCoachData({ events, wellnessEntries, phaseInfo, bgModel, raceDate, lthr, maxHr, hrZones, paceTable, currentBG, trendSlope, trendArrow, lastUpdate, readings, runBGContexts }: UseCoachDataOptions) {
  const fitnessData = wellnessToFitnessData(wellnessEntries);
  const insights = fitnessData.length === 0
    ? null
    : computeInsights(fitnessData, events);

  const context = (events.length === 0 || fitnessData.length === 0)
    ? ""
    : buildSystemPrompt({
        phaseInfo,
        insights,
        bgModel,
        events,
        raceDate,
        lthr,
        maxHr,
        hrZones,
        paceTable,
        currentBG,
        trendSlope,
        trendArrow,
        lastUpdate,
        readings,
        runBGContexts,
      });

  return { context, isLoading: events.length === 0 || fitnessData.length === 0 };
}
