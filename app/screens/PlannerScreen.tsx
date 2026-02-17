"use client";

import { useState } from "react";
import {
  generatePlan,
  uploadToIntervals,
  analyzeHistory,
  WorkoutEvent,
} from "@/lib/plannerLogic";
import { RaceSettings } from "../components/RaceSettings";
import { PhysiologySettings } from "../components/PhysiologySettings";
import { PlanStructureSettings } from "../components/PlanStructureSettings";
import { AnalysisSection } from "../components/AnalysisSection";
import { WeeklyVolumeChart } from "../components/WeeklyVolumeChart";
import { WorkoutList } from "../components/WorkoutList";
import { ActionBar } from "../components/ActionBar";
import { StatusMessage } from "../components/StatusMessage";
import { EmptyState } from "../components/EmptyState";
import { useWeeklyVolumeData } from "../hooks/useWeeklyVolumeData";

interface PlannerScreenProps {
  apiKey: string;
}

export function PlannerScreen({ apiKey }: PlannerScreenProps) {
  const [raceName, setRaceName] = useState("EcoTrail");
  const [raceDate, setRaceDate] = useState("2026-06-13");
  const [raceDist, setRaceDist] = useState(16);
  const [lthr, setLthr] = useState(169);
  const [prefix, setPrefix] = useState("eco16");
  const [totalWeeks, setTotalWeeks] = useState(18);
  const [startKm, setStartKm] = useState(8);
  const [fuelInterval, setFuelInterval] = useState(5);
  const [fuelLong, setFuelLong] = useState(10);
  const [fuelEasy, setFuelEasy] = useState(8);
  const [planEvents, setPlanEvents] = useState<WorkoutEvent[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [longRunAnalysis, setLongRunAnalysis] = useState<{
    trend: number;
    plotData: { time: number; glucose: number }[];
  } | null>(null);
  const [easyRunAnalysis, setEasyRunAnalysis] = useState<{
    trend: number;
    plotData: { time: number; glucose: number }[];
  } | null>(null);
  const [intervalAnalysis, setIntervalAnalysis] = useState<{
    trend: number;
    plotData: { time: number; glucose: number }[];
  } | null>(null);

  const chartData = useWeeklyVolumeData(planEvents);

  const handleAnalyze = async () => {
    if (!apiKey) {
      setStatusMsg("❌ Missing API Key");
      return;
    }
    setIsAnalyzing(true);
    const result = await analyzeHistory(apiKey, prefix);

    // Long Run Analysis
    if (result.longRun) {
      setLongRunAnalysis({
        trend: result.longRun.trend,
        plotData: result.longRun.plotData,
      });

      let suggLong = result.longRun.currentFuel;
      if (result.longRun.trend < -3.0) {
        const diff = Math.abs(result.longRun.trend - -3.0);
        suggLong += Math.min(1 + Math.floor(diff * 0.7), 4);
      } else if (result.longRun.trend > 3.0) {
        suggLong = Math.max(0, suggLong - 1);
      }
      setFuelLong(suggLong);
    }

    // Easy Run Analysis
    if (result.easyRun) {
      setEasyRunAnalysis({
        trend: result.easyRun.trend,
        plotData: result.easyRun.plotData,
      });

      let suggEasy = result.easyRun.currentFuel;
      if (result.easyRun.trend < -3.0) {
        const diff = Math.abs(result.easyRun.trend - -3.0);
        suggEasy += Math.min(1 + Math.floor(diff * 0.7), 4);
      } else if (result.easyRun.trend > 3.0) {
        suggEasy = Math.max(0, suggEasy - 1);
      }
      setFuelEasy(suggEasy);
    }

    // Interval Analysis
    if (result.interval) {
      setIntervalAnalysis({
        trend: result.interval.trend,
        plotData: result.interval.plotData,
      });

      let suggInt = result.interval.currentFuel;
      if (result.interval.trend > 3.0) {
        suggInt = Math.max(0, suggInt - 1);
      }
      setFuelInterval(suggInt);
    }

    setIsAnalyzing(false);
    setStatusMsg("✓ Analysis Complete — Fuel adjusted automatically");
  };

  const handleGenerate = () => {
    const events = generatePlan(
      fuelInterval,
      fuelLong,
      fuelEasy,
      raceDate,
      raceDist,
      prefix,
      totalWeeks,
      startKm,
      lthr,
    );

    // Filter out past workouts - keep today and future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureEvents = events.filter((e) => e.start_date_local >= today);

    setPlanEvents(futureEvents);
    setStatusMsg("");
  };

  const handleUpload = async () => {
    if (!apiKey) {
      setStatusMsg("❌ Missing API Key");
      return;
    }
    setIsUploading(true);
    try {
      const count = await uploadToIntervals(apiKey, planEvents);
      setStatusMsg(`✅ Success! Uploaded ${count} workouts.`);
    } catch (e) {
      setStatusMsg(`❌ Error: ${e}`);
    }
    setIsUploading(false);
  };

  return (
    <div className="h-full bg-[#0d0a1a] flex flex-col md:flex-row text-white font-sans overflow-hidden">
      <aside className="w-full md:w-80 bg-[#1e1535] border-r border-[#3d2b5a] p-6 flex flex-col gap-6 shrink-0 overflow-y-auto h-full">
        <div className="space-y-4">
          <RaceSettings
            raceName={raceName}
            raceDate={raceDate}
            raceDist={raceDist}
            onRaceNameChange={setRaceName}
            onRaceDateChange={setRaceDate}
            onRaceDistChange={setRaceDist}
          />

          <PhysiologySettings lthr={lthr} onLthrChange={setLthr} />

          <PlanStructureSettings
            prefix={prefix}
            totalWeeks={totalWeeks}
            startKm={startKm}
            onPrefixChange={setPrefix}
            onTotalWeeksChange={setTotalWeeks}
            onStartKmChange={setStartKm}
          />
        </div>

        <hr className="border-[#3d2b5a]" />

        <AnalysisSection
          prefix={prefix}
          longRunAnalysis={longRunAnalysis}
          easyRunAnalysis={easyRunAnalysis}
          intervalAnalysis={intervalAnalysis}
          fuelInterval={fuelInterval}
          fuelLong={fuelLong}
          fuelEasy={fuelEasy}
          isAnalyzing={isAnalyzing}
          onAnalyze={handleAnalyze}
          onFuelIntervalChange={setFuelInterval}
          onFuelLongChange={setFuelLong}
          onFuelEasyChange={setFuelEasy}
        />

        <button
          onClick={handleGenerate}
          className="w-full py-3 bg-[#ff2d95] text-white rounded-lg font-bold hover:bg-[#e0207a] transition shadow-lg shadow-[#ff2d95]/20 mt-auto"
        >
          Generate Plan
        </button>
      </aside>

      <main className="flex-1 bg-[#0d0a1a] overflow-y-auto h-full">
        <div className="p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {planEvents.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-8">
                <WeeklyVolumeChart data={chartData} />
                <ActionBar
                  workoutCount={planEvents.length}
                  isUploading={isUploading}
                  onUpload={handleUpload}
                />
                <StatusMessage message={statusMsg} />
                <WorkoutList events={planEvents} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
