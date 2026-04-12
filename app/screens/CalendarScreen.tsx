"use client";

import { useAtomValue, useSetAtom } from "jotai";
import {
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
import { getThresholdPace } from "@/lib/paceTable";

export function CalendarScreen() {
  const events = useAtomValue(enrichedEventsAtom);
  const isLoading = useAtomValue(calendarLoadingAtom);
  const error = useAtomValue(calendarErrorAtom);
  const reload = useSetAtom(calendarReloadAtom);
  const runBGContexts = useAtomValue(runBGContextsAtom);
  const paceTable = useAtomValue(paceTableAtom);
  const bgModel = useAtomValue(bgModelAtom);
  const settings = useAtomValue(settingsAtom);

  const racePacePerKm = getThresholdPace(settings?.currentAbilityDist, settings?.currentAbilitySecs);

  return (
    <div className="h-full bg-bg flex flex-col text-text font-sans overflow-hidden">
      <main className="flex-1 bg-bg min-h-0 min-w-0">
        <div className="px-1 py-1 md:p-6 h-full flex flex-col overflow-hidden">
          <CalendarView initialEvents={events} isLoadingInitial={isLoading} initialError={error} onRetryLoad={reload} runBGContexts={runBGContexts} paceTable={paceTable} bgModel={bgModel} hrZones={settings?.hrZones} lthr={settings?.lthr} warmthPreference={settings?.warmthPreference} racePacePerKm={racePacePerKm} />
        </div>
      </main>
    </div>
  );
}
