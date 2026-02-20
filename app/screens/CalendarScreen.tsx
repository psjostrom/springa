"use client";

import type { CalendarEvent } from "@/lib/types";
import { CalendarView } from "../components/CalendarView";

interface CalendarScreenProps {
  apiKey: string;
  initialEvents: CalendarEvent[];
  isLoadingInitial: boolean;
  initialError: string | null;
  onRetryLoad?: () => void;
}

export function CalendarScreen({ apiKey, initialEvents, isLoadingInitial, initialError, onRetryLoad }: CalendarScreenProps) {
  return (
    <div className="h-full bg-[#0d0a1a] flex flex-col text-white font-sans overflow-hidden">
      <main className="flex-1 bg-[#0d0a1a] min-h-0 min-w-0">
        <div className="p-4 md:p-6 h-full flex flex-col overflow-hidden">
          <CalendarView apiKey={apiKey} initialEvents={initialEvents} isLoadingInitial={isLoadingInitial} initialError={initialError} onRetryLoad={onRetryLoad} />
        </div>
      </main>
    </div>
  );
}
