"use client";

import { CalendarView } from "../components/CalendarView";

interface CalendarScreenProps {
  apiKey: string;
}

export function CalendarScreen({ apiKey }: CalendarScreenProps) {
  return (
    <div className="h-full bg-[#0d0a1a] flex flex-col text-white font-sans overflow-hidden">
      <main className="flex-1 bg-[#0d0a1a] min-h-0 min-w-0">
        <div className="p-4 md:p-6 h-full flex flex-col overflow-hidden">
          <CalendarView apiKey={apiKey} />
        </div>
      </main>
    </div>
  );
}
