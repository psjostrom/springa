"use client";

import { computeFitnessData, computeInsights } from "@/lib/fitness";
import { buildSystemPrompt } from "@/lib/coachContext";
import type { BGResponseModel } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";
import type { XdripReading } from "@/lib/xdrip";
import type { RunBGContext } from "@/lib/runBGContext";
import type { PaceTable } from "@/lib/types";

interface UseCoachDataOptions {
  events: CalendarEvent[];
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

export function useCoachData({ events, phaseInfo, bgModel, raceDate, lthr, maxHr, hrZones, paceTable, currentBG, trendSlope, trendArrow, lastUpdate, readings, runBGContexts }: UseCoachDataOptions) {
  const insights = events.length === 0
    ? null
    : computeInsights(computeFitnessData(events, 365), events);

  const context = events.length === 0
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

  return { context, isLoading: events.length === 0 };
}
