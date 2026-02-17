"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { startOfMonth, subMonths, endOfMonth, addMonths } from "date-fns";
import { Loader2 } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";
import { fetchCalendarData } from "@/lib/intervalsApi";
import { computeFitnessData, computeInsights } from "@/lib/fitness";
import { PhaseTracker } from "../components/PhaseTracker";
import { VolumeTrendChart } from "../components/VolumeTrendChart";
import { FitnessChart } from "../components/FitnessChart";
import { FitnessInsightsPanel } from "../components/FitnessInsightsPanel";

interface ProgressScreenProps {
  apiKey: string;
  phaseName: string;
  currentWeek: number;
  totalWeeks: number;
  progress: number;
}

const RACE_DATE = "2026-06-13";

export function ProgressScreen({
  apiKey,
  phaseName,
  currentWeek,
  totalWeeks,
  progress,
}: ProgressScreenProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!apiKey || loadedRef.current) return;
    loadedRef.current = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const start = startOfMonth(subMonths(new Date(), 24));
        const end = endOfMonth(addMonths(new Date(), 6));
        const data = await fetchCalendarData(apiKey, start, end, {
          includePairedEvents: true,
        });
        setEvents(data);
      } catch (err) {
        console.error("ProgressScreen: failed to load events", err);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [apiKey]);

  const fitnessData = useMemo(
    () => computeFitnessData(events, 180),
    [events],
  );

  const insights = useMemo(
    () => (fitnessData.length > 0 ? computeInsights(fitnessData, events) : null),
    [fitnessData, events],
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
        {isLoading ? (
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
          apiKey={apiKey}
          raceDate={RACE_DATE}
          totalWeeks={totalWeeks}
        />
      </div>
    </div>
  );
}
