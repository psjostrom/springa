"use client";

import { wellnessToFitnessData, computeInsights } from "@/lib/fitness";
import { buildSystemPrompt } from "@/lib/coachContext";
import type { BGResponseModel } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";
import type { BGReading } from "@/lib/cgm";
import type { RunBGContext } from "@/lib/runBGContext";
import type { PaceTable } from "@/lib/types";
import type { WellnessEntry } from "@/lib/intervalsApi";
import type { RunForFloorAnalysis } from "@/lib/personalHypoFloor";

interface UseCoachDataOptions {
  events: CalendarEvent[];
  wellnessEntries: WellnessEntry[];
  phaseInfo: { name: string; week: number; progress: number };
  bgModel: BGResponseModel | null;
  lthr?: number;
  maxHr?: number;
  hrZones: number[];
  paceTable?: PaceTable;
  currentBG?: number | null;
  trendSlope?: number | null;
  trendArrow?: string | null;
  lastUpdate?: Date | null;
  readings?: BGReading[];
  runBGContexts?: Map<string, RunBGContext>;
  profile?: {
    dob?: string;
    weightKg?: number;
    heightCm?: number;
    t1dSinceYear?: number;
    pumpModel?: string;
    cgmModel?: string;
    loopSystem?: string;
    pumpDuringRuns?: "on" | "off" | "mixed";
    vo2max?: number;
    thresholdPaceMinPerKm?: number;
  };
  race?: {
    name?: string;
    distanceKm?: number;
    date?: string;
  };
  derived?: {
    longestRun?: { distanceKm: number; name: string; dateISO: string };
    volume?: { runs7d: number; runs28d: number };
    earliestRunDate?: string;
  };
  pastRuns?: RunForFloorAnalysis[];
}

export function useCoachData({
  events,
  wellnessEntries,
  phaseInfo,
  bgModel,
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
  profile,
  race,
  derived,
  pastRuns,
}: UseCoachDataOptions) {
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
        profile,
        race,
        derived,
        pastRuns,
      });

  return { context, isLoading: events.length === 0 || fitnessData.length === 0 };
}
