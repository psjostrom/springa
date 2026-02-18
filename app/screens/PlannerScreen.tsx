"use client";

import { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import type { WorkoutEvent, WorkoutCategory } from "@/lib/types";
import type { BGResponseModel } from "@/lib/bgModel";
import { uploadToIntervals } from "@/lib/intervalsApi";
import { generatePlan } from "@/lib/workoutGenerators";
import { RaceSettings } from "../components/RaceSettings";
import { PhysiologySettings } from "../components/PhysiologySettings";
import { PlanStructureSettings } from "../components/PlanStructureSettings";
import { WeeklyVolumeChart } from "../components/WeeklyVolumeChart";
import { WorkoutList } from "../components/WorkoutList";
import { ActionBar } from "../components/ActionBar";
import { StatusMessage } from "../components/StatusMessage";
import { EmptyState } from "../components/EmptyState";
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
}

export function PlannerScreen({ apiKey, bgModel }: PlannerScreenProps) {
  const [raceName, setRaceName] = useState("EcoTrail");
  const [raceDate, setRaceDate] = useState("2026-06-13");
  const [raceDist, setRaceDist] = useState(16);
  const [lthr, setLthr] = useState(169);
  const [prefix, setPrefix] = useState("eco16");
  const [totalWeeks, setTotalWeeks] = useState(18);
  const [startKm, setStartKm] = useState(8);
  const [fuelInterval, setFuelInterval] = useState(() => fuelDefault(bgModel, "interval", DEFAULT_FUEL.interval));
  const [fuelLong, setFuelLong] = useState(() => fuelDefault(bgModel, "long", DEFAULT_FUEL.long));
  const [fuelEasy, setFuelEasy] = useState(() => fuelDefault(bgModel, "easy", DEFAULT_FUEL.easy));
  const [planEvents, setPlanEvents] = useState<WorkoutEvent[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const chartData = useWeeklyVolumeData(planEvents);
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
      <PhysiologySettings
        lthr={lthr}
        fuelEasy={fuelEasy}
        fuelLong={fuelLong}
        fuelInterval={fuelInterval}
        onLthrChange={setLthr}
        onFuelEasyChange={setFuelEasy}
        onFuelLongChange={setFuelLong}
        onFuelIntervalChange={setFuelInterval}
      />
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
      className="w-full py-3 bg-[#ff2d95] text-white rounded-lg font-bold hover:bg-[#e0207a] transition shadow-lg shadow-[#ff2d95]/20"
    >
      Generate Plan
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
