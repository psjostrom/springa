"use client";

import { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import type { WorkoutEvent } from "@/lib/types";
import { uploadToIntervals } from "@/lib/intervalsApi";
import { analyzeHistory } from "@/lib/analysis";
import { generatePlan } from "@/lib/workoutGenerators";
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
  const [fuelInterval, setFuelInterval] = useState(30);
  const [fuelLong, setFuelLong] = useState(60);
  const [fuelEasy, setFuelEasy] = useState(48);
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
  const [hasGenerated, setHasGenerated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);

  const runGenerate = useCallback(
    (fi: number, fl: number, fe: number) => {
      const events = generatePlan(fi, fl, fe, raceDate, raceDist, prefix, totalWeeks, startKm, lthr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setPlanEvents(events.filter((e) => e.start_date_local >= today));
    },
    [raceDate, raceDist, prefix, totalWeeks, startKm, lthr],
  );

  const handleFuelChange = (type: "long" | "easy" | "interval", v: number) => {
    const next = { interval: fuelInterval, long: fuelLong, easy: fuelEasy, [type]: v };
    if (type === "long") setFuelLong(v);
    else if (type === "easy") setFuelEasy(v);
    else setFuelInterval(v);
    if (hasGenerated) runGenerate(next.interval, next.long, next.easy);
  };

  const handleGenerate = async () => {
    if (!apiKey) {
      setStatusMsg("❌ Missing API Key");
      return;
    }

    setIsAnalyzing(true);
    setLongRunAnalysis(null);
    setEasyRunAnalysis(null);
    setIntervalAnalysis(null);

    let result;
    try {
      result = await analyzeHistory(apiKey, prefix);
    } catch (err) {
      console.error("Analysis failed unexpectedly:", err);
      setIsAnalyzing(false);
      setStatusMsg("Analysis failed. Generating plan with default fuel values.");
      runGenerate(fuelInterval, fuelLong, fuelEasy);
      setHasGenerated(true);
      return;
    }

    let fi = fuelInterval;
    let fl = fuelLong;
    let fe = fuelEasy;

    if (result.longRun) {
      setLongRunAnalysis({
        trend: result.longRun.trend,
        plotData: result.longRun.plotData,
      });
      fl = result.longRun.currentFuel;
      if (result.longRun.trend < -3.0) {
        const diff = Math.abs(result.longRun.trend - -3.0);
        fl += Math.min(6 + Math.floor(diff * 4), 24);
      } else if (result.longRun.trend > 3.0) {
        fl = Math.max(0, fl - 6);
      }
      setFuelLong(fl);
    }

    if (result.easyRun) {
      setEasyRunAnalysis({
        trend: result.easyRun.trend,
        plotData: result.easyRun.plotData,
      });
      fe = result.easyRun.currentFuel;
      if (result.easyRun.trend < -3.0) {
        const diff = Math.abs(result.easyRun.trend - -3.0);
        fe += Math.min(6 + Math.floor(diff * 4), 24);
      } else if (result.easyRun.trend > 3.0) {
        fe = Math.max(0, fe - 6);
      }
      setFuelEasy(fe);
    }

    if (result.interval) {
      setIntervalAnalysis({
        trend: result.interval.trend,
        plotData: result.interval.plotData,
      });
      fi = result.interval.currentFuel;
      if (result.interval.trend > 3.0) {
        fi = Math.max(0, fi - 6);
      }
      setFuelInterval(fi);
    }

    setIsAnalyzing(false);

    // Generate immediately with the adjusted fuel values
    runGenerate(fi, fl, fe);
    setHasGenerated(true);
    setStatusMsg(result.msg || "");
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

  const settingsPanel = (
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
  );

  const generateButton = (
    <button
      onClick={() => {
        handleGenerate();
        setSettingsOpen(false);
      }}
      disabled={isAnalyzing}
      className="w-full py-3 bg-[#ff2d95] text-white rounded-lg font-bold hover:bg-[#e0207a] transition shadow-lg shadow-[#ff2d95]/20 disabled:opacity-50"
    >
      {isAnalyzing ? "Analyzing..." : "Generate Plan"}
    </button>
  );

  return (
    <div className="h-full bg-[#0d0a1a] flex flex-col md:flex-row text-white font-sans overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-80 bg-[#1e1535] border-r border-[#3d2b5a] p-6 flex-col gap-6 shrink-0 overflow-y-auto h-full">
        {settingsPanel}
        <div className="mt-auto">{generateButton}</div>
      </aside>

      {/* Mobile + Main content */}
      <main className="flex-1 bg-[#0d0a1a] overflow-y-auto h-full">
        <div className="p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Mobile: collapsible settings */}
            <div className="md:hidden">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="w-full flex items-center justify-between bg-[#1e1535] p-3 rounded-lg border border-[#3d2b5a] text-sm font-semibold"
              >
                Settings
                <ChevronDown
                  size={18}
                  className={`transition-transform ${settingsOpen ? "rotate-180" : ""}`}
                />
              </button>
              {settingsOpen && (
                <div className="bg-[#1e1535] p-4 rounded-b-lg border border-t-0 border-[#3d2b5a] space-y-4">
                  {settingsPanel}
                </div>
              )}
              <div className="mt-3">{generateButton}</div>
            </div>

            {planEvents.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-8">
                <AnalysisSection
                  longRunAnalysis={longRunAnalysis}
                  easyRunAnalysis={easyRunAnalysis}
                  intervalAnalysis={intervalAnalysis}
                  fuelValues={{ long: fuelLong, easy: fuelEasy, interval: fuelInterval }}
                  onFuelChange={handleFuelChange}
                />
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
