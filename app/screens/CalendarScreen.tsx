"use client";

import { CalendarView } from "../components/CalendarView";
import { PhaseTracker } from "../components/PhaseTracker";

interface CalendarScreenProps {
  apiKey: string;
  phaseName: string;
  currentWeek: number;
  totalWeeks: number;
  progress: number;
}

export function CalendarScreen({
  apiKey,
  phaseName,
  currentWeek,
  totalWeeks,
  progress,
}: CalendarScreenProps) {
  return (
    <div className="h-full bg-slate-50 flex flex-col lg:flex-row text-slate-900 font-sans overflow-hidden">
      <aside className="hidden lg:flex lg:w-80 bg-white border-r border-slate-200 p-6 flex-col gap-6 shrink-0 overflow-y-auto h-full">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-xl font-bold tracking-tight">📅 Calendar</h1>
        </div>

        <div className="space-y-4">
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
        </div>
      </aside>

      <main className="flex-1 bg-slate-50 min-h-0 min-w-0">
        <div className="p-4 md:p-6 h-full flex flex-col overflow-hidden">
          <CalendarView apiKey={apiKey} />
        </div>
      </main>
    </div>
  );
}
