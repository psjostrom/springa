"use client";

import { useAtomValue } from "jotai";
import {
  apiKeyAtom,
  enrichedEventsAtom,
  calendarLoadingAtom,
  calendarErrorAtom,
  calendarReloadAtom,
  runBGContextsAtom,
  paceTableAtom,
  bgModelAtom,
  settingsAtom,
} from "../atoms";
import { CalendarView } from "../components/CalendarView";

export function CalendarScreen() {
  const apiKey = useAtomValue(apiKeyAtom);
  const events = useAtomValue(enrichedEventsAtom);
  const isLoading = useAtomValue(calendarLoadingAtom);
  const error = useAtomValue(calendarErrorAtom);
  const reload = useAtomValue(calendarReloadAtom);
  const runBGContexts = useAtomValue(runBGContextsAtom);
  const paceTable = useAtomValue(paceTableAtom);
  const bgModel = useAtomValue(bgModelAtom);
  const settings = useAtomValue(settingsAtom);

  return (
    <div className="h-full bg-[#0d0a1a] flex flex-col text-white font-sans overflow-hidden">
      <main className="flex-1 bg-[#0d0a1a] min-h-0 min-w-0">
        <div className="px-1 py-1 md:p-6 h-full flex flex-col overflow-hidden">
          <CalendarView apiKey={apiKey} initialEvents={events} isLoadingInitial={isLoading} initialError={error} onRetryLoad={reload} runBGContexts={runBGContexts} paceTable={paceTable} bgModel={bgModel} hrZones={settings?.hrZones} lthr={settings?.lthr} />
        </div>
      </main>
    </div>
  );
}
