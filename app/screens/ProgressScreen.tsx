"use client";

import { PhaseTracker } from "../components/PhaseTracker";
import { VolumeTrendChart } from "../components/VolumeTrendChart";

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
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
            Training Progress
          </label>
          <PhaseTracker
            phaseName={phaseName}
            currentWeek={currentWeek}
            totalWeeks={totalWeeks}
            progress={progress}
          />
        </div>

        <VolumeTrendChart
          apiKey={apiKey}
          raceDate={RACE_DATE}
          totalWeeks={totalWeeks}
        />
      </div>
    </div>
  );
}
