"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";
import type { CachedActivity } from "@/lib/settings";
import { computeFitnessData, computeInsights } from "@/lib/fitness";
import type { BGResponseModel } from "@/lib/bgModel";
import { extractZoneSegments, buildCalibratedPaceTable, toPaceTable } from "@/lib/paceCalibration";
import { PhaseTracker } from "../components/PhaseTracker";
import { VolumeTrendChart } from "../components/VolumeTrendChart";
import { FitnessChart } from "../components/FitnessChart";
import { FitnessInsightsPanel } from "../components/FitnessInsightsPanel";
import { BGResponsePanel } from "../components/BGResponsePanel";
import { BGScatterChart } from "../components/BGScatterChart";
import { PaceCalibrationCard } from "../components/PaceCalibrationCard";
import { ErrorCard } from "../components/ErrorCard";

interface IntelScreenProps {
  apiKey: string;
  events: CalendarEvent[];
  eventsLoading: boolean;
  eventsError: string | null;
  onRetryLoad: () => void;
  phaseName: string;
  currentWeek: number;
  totalWeeks: number;
  progress: number;
  bgModel: BGResponseModel | null;
  bgModelLoading: boolean;
  bgModelProgress: { done: number; total: number };
  raceDate: string;
  raceDist?: number;
  prefix?: string;
  startKm?: number;
  lthr?: number;
  bgActivityNames: Map<string, string>;
  cachedActivities: CachedActivity[];
}

export function IntelScreen({
  events,
  eventsLoading,
  eventsError,
  onRetryLoad,
  phaseName,
  currentWeek,
  totalWeeks,
  progress,
  raceDate,
  raceDist,
  prefix,
  startKm,
  lthr,
  bgModel,
  bgModelLoading,
  bgModelProgress,
  bgActivityNames,
  cachedActivities,
}: IntelScreenProps) {
  const fitnessData = useMemo(
    () => computeFitnessData(events, 180),
    [events],
  );

  const insights = useMemo(
    () => (fitnessData.length > 0 ? computeInsights(fitnessData, events) : null),
    [fitnessData, events],
  );

  const paceCalibration = useMemo(() => {
    if (!lthr || cachedActivities.length === 0) return null;
    const allSegments = cachedActivities.flatMap((a) =>
      a.pace && a.pace.length > 0 && a.hr.length > 0
        ? extractZoneSegments(a.hr, a.pace, lthr, a.activityId, a.activityDate ?? "")
        : [],
    );
    if (allSegments.length === 0) return null;
    return buildCalibratedPaceTable(allSegments);
  }, [cachedActivities, lthr]);

  const paceTable = useMemo(
    () => paceCalibration ? toPaceTable(paceCalibration) : undefined,
    [paceCalibration],
  );

  return (
    <div className="h-full overflow-y-auto bg-[#0d0a1a]">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Phase Tracker */}
        <div>
          <label className="block text-sm font-semibold uppercase text-[#b8a5d4] mb-2">
            Training Progress
          </label>
          <PhaseTracker
            phaseName={phaseName}
            currentWeek={currentWeek}
            totalWeeks={totalWeeks}
            progress={progress}
          />
        </div>

        {/* Fitness & Insights */}
        {eventsError ? (
          <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6">
            <ErrorCard message={eventsError} onRetry={onRetryLoad} />
          </div>
        ) : eventsLoading ? (
          <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6">
            <div className="flex items-center justify-center py-8 text-[#b8a5d4]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading fitness data...</span>
            </div>
          </div>
        ) : (
          fitnessData.length > 0 &&
          insights && (
            <>
              {/* Insights */}
              <div>
                <label className="block text-sm font-semibold uppercase text-[#b8a5d4] mb-2">
                  Fitness Insights
                </label>
                <FitnessInsightsPanel insights={insights} />
              </div>

              {/* Fitness Chart */}
              <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4">
                <div className="text-sm font-semibold text-[#c4b5fd] mb-3">
                  Fitness / Fatigue / Form
                </div>
                <FitnessChart data={fitnessData} />
              </div>
            </>
          )
        )}

        {/* Volume Trend */}
        <VolumeTrendChart
          events={events}
          raceDate={raceDate}
          totalWeeks={totalWeeks}
          raceDist={raceDist}
          prefix={prefix}
          startKm={startKm}
          lthr={lthr}
          paceTable={paceTable}
        />

        {/* Pace Zones */}
        {paceCalibration && lthr && (
          <PaceCalibrationCard calibration={paceCalibration} lthr={lthr} />
        )}

        {/* BG Response Model */}
        {bgModelLoading ? (
          <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6">
            <div className="flex items-center justify-center py-8 text-[#b8a5d4]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">
                Analyzing BG response... {bgModelProgress.done}/{bgModelProgress.total} runs
              </span>
            </div>
          </div>
        ) : bgModel ? (
          <div className="space-y-4">
            <BGResponsePanel model={bgModel} activityNames={bgActivityNames} />
            <BGScatterChart model={bgModel} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
