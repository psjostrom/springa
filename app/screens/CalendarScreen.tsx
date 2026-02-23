"use client";

import type { CalendarEvent, PaceTable } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import { CalendarView } from "../components/CalendarView";

interface CalendarScreenProps {
  apiKey: string;
  initialEvents: CalendarEvent[];
  isLoadingInitial: boolean;
  initialError: string | null;
  onRetryLoad?: () => void;
  runBGContexts?: Map<string, RunBGContext>;
  paceTable?: PaceTable;
}

export function CalendarScreen({ apiKey, initialEvents, isLoadingInitial, initialError, onRetryLoad, runBGContexts, paceTable }: CalendarScreenProps) {
  return (
    <div className="h-full bg-[#0d0a1a] flex flex-col text-white font-sans overflow-hidden">
      <main className="flex-1 bg-[#0d0a1a] min-h-0 min-w-0">
        <div className="px-1 py-1 md:p-6 h-full flex flex-col overflow-hidden">
          <CalendarView apiKey={apiKey} initialEvents={initialEvents} isLoadingInitial={isLoadingInitial} initialError={initialError} onRetryLoad={onRetryLoad} runBGContexts={runBGContexts} paceTable={paceTable} />
        </div>
      </main>
    </div>
  );
}
