"use client";

import { CalendarView } from "../components/CalendarView";

interface CalendarScreenProps {
  apiKey: string;
}

export function CalendarScreen({ apiKey }: CalendarScreenProps) {
  return (
    <div className="h-full bg-slate-50 flex flex-col text-slate-900 font-sans overflow-hidden">
      <main className="flex-1 bg-slate-50 min-h-0 min-w-0">
        <div className="p-4 md:p-6 h-full flex flex-col overflow-hidden">
          <CalendarView apiKey={apiKey} />
        </div>
      </main>
    </div>
  );
}
