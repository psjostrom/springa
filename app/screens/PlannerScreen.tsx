"use client";

import { useState, useCallback } from "react";
import type { WorkoutEvent, WorkoutCategory } from "@/lib/types";
import type { BGResponseModel } from "@/lib/bgModel";
import { uploadToIntervals } from "@/lib/intervalsApi";
import { generatePlan } from "@/lib/workoutGenerators";
import { WeeklyVolumeChart } from "../components/WeeklyVolumeChart";
import { WorkoutList } from "../components/WorkoutList";
import { ActionBar } from "../components/ActionBar";
import { useWeeklyVolumeData } from "../hooks/useWeeklyVolumeData";

const DEFAULT_FUEL = { easy: 48, long: 60, interval: 30 };

function fuelDefault(bgModel: BGResponseModel | null | undefined, category: WorkoutCategory, fallback: number): number {
  if (!bgModel) return fallback;
  const target = bgModel.targetFuelRates.find((t) => t.category === category);
  const value = target?.targetFuelRate ?? bgModel.categories[category]?.avgFuelRate;
  return value != null ? Math.round(value) : fallback;
}

interface PlannerScreenProps {
  apiKey: string;
  bgModel?: BGResponseModel | null;
  raceDate: string;
  raceName?: string;
  raceDist?: number;
  prefix?: string;
  totalWeeks?: number;
  startKm?: number;
  lthr?: number;
}

export function PlannerScreen({ apiKey, bgModel, raceDate, ...props }: PlannerScreenProps) {
  const raceDist = props.raceDist ?? 16;
  const lthr = props.lthr ?? 169;
  const prefix = props.prefix ?? "eco16";
  const totalWeeks = props.totalWeeks ?? 18;
  const startKm = props.startKm ?? 8;
  const [fuelInterval, setFuelInterval] = useState(() => fuelDefault(bgModel, "interval", DEFAULT_FUEL.interval));
  const [fuelLong, setFuelLong] = useState(() => fuelDefault(bgModel, "long", DEFAULT_FUEL.long));
  const [fuelEasy, setFuelEasy] = useState(() => fuelDefault(bgModel, "easy", DEFAULT_FUEL.easy));
  const [planEvents, setPlanEvents] = useState<WorkoutEvent[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const chartData = useWeeklyVolumeData(planEvents);

  const runGenerate = useCallback(
    (fi: number, fl: number, fe: number) => {
      const events = generatePlan(fi, fl, fe, raceDate, raceDist, prefix, totalWeeks, startKm, lthr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setPlanEvents(events.filter((e) => e.start_date_local >= today));
    },
    [raceDate, raceDist, prefix, totalWeeks, startKm, lthr],
  );

  const handleGenerate = () => {
    if (!apiKey) {
      setStatusMsg("Missing API Key");
      return;
    }
    runGenerate(fuelInterval, fuelLong, fuelEasy);
    setStatusMsg("");
  };

  const handleUpload = async () => {
    if (!apiKey) {
      setStatusMsg("Missing API Key");
      return;
    }
    setIsUploading(true);
    try {
      const count = await uploadToIntervals(apiKey, planEvents);
      setStatusMsg(`Uploaded ${count} workouts.`);
    } catch (e) {
      setStatusMsg(`Error: ${e}`);
    }
    setIsUploading(false);
  };

  const inputClass =
    "w-full p-2 border border-[#3d2b5a] bg-[#1a1030] text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#ff2d95] transition";

  return (
    <div className="h-full overflow-y-auto bg-[#0d0a1a]">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Fuel rates + Generate */}
        <div className="relative overflow-hidden bg-[#1e1535] border border-[#3d2b5a] rounded-xl p-4 md:p-5">
          <div className="absolute inset-0 bg-gradient-to-r from-[#ff2d95]/5 via-transparent to-[#6c3aed]/5 pointer-events-none" />
          <div className="relative flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#b8a5d4]">
                Fuel rates <span className="text-[#7a6899]">g/h</span>
              </span>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <label className="flex flex-col text-xs text-[#b8a5d4] gap-1">
                  Easy
                  <input type="number" value={fuelEasy} onChange={(e) => setFuelEasy(Number(e.target.value))} className={inputClass} />
                </label>
                <label className="flex flex-col text-xs text-[#b8a5d4] gap-1">
                  Long
                  <input type="number" value={fuelLong} onChange={(e) => setFuelLong(Number(e.target.value))} className={inputClass} />
                </label>
                <label className="flex flex-col text-xs text-[#b8a5d4] gap-1">
                  Interval
                  <input type="number" value={fuelInterval} onChange={(e) => setFuelInterval(Number(e.target.value))} className={inputClass} />
                </label>
              </div>
            </div>
            <button
              onClick={handleGenerate}
              className="w-full md:w-auto md:min-w-[160px] py-2.5 px-6 bg-[#ff2d95] text-white rounded-lg font-bold hover:bg-[#e0207a] transition shadow-lg shadow-[#ff2d95]/20 shrink-0"
            >
              Generate Plan
            </button>
          </div>
        </div>

        {planEvents.length > 0 && (
          <>
            <WeeklyVolumeChart data={chartData} />
            <ActionBar
              workoutCount={planEvents.length}
              isUploading={isUploading}
              statusMsg={statusMsg}
              onUpload={handleUpload}
            />
            <WorkoutList events={planEvents} />
          </>
        )}
      </div>
    </div>
  );
}
