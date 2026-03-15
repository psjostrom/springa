"use client";

import { useState, useEffect, useEffectEvent, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAtomValue, useSetAtom } from "jotai";
import type { WorkoutEvent } from "@/lib/types";
import type { RunBGContext } from "@/lib/runBGContext";
import type { AdaptedEvent } from "@/lib/adaptPlan";
import { uploadToIntervals, updateEvent } from "@/lib/intervalsApi";
import { hasLowConfidenceFuel, buildSyncPayload } from "@/lib/syncPayload";
import { generatePlan } from "@/lib/workoutGenerators";
import { wellnessToFitnessData, computeInsights } from "@/lib/fitness";
import { WeeklyVolumeChart } from "../components/WeeklyVolumeChart";
import { WorkoutList } from "../components/WorkoutList";
import { ActionBar } from "../components/ActionBar";
import { useWeeklyVolumeData } from "../hooks/useWeeklyVolumeData";
import { getCurrentFuelRate, DEFAULT_FUEL } from "@/lib/fuelRate";
import { DEFAULT_LTHR } from "@/lib/constants";
import {
  apiKeyAtom,
  settingsAtom,
  bgModelAtom,
  paceTableAtom,
  enrichedEventsAtom,
  wellnessEntriesAtom,
  runBGContextsAtom,
  calendarReloadAtom,
} from "../atoms";

interface PlannerScreenProps {
  autoAdapt?: boolean;
}

export function PlannerScreen({ autoAdapt }: PlannerScreenProps) {
  const apiKey = useAtomValue(apiKeyAtom);
  const bgModel = useAtomValue(bgModelAtom);
  const settings = useAtomValue(settingsAtom);
  const paceTable = useAtomValue(paceTableAtom);
  const calendarEvents = useAtomValue(enrichedEventsAtom);
  const wellnessEntries = useAtomValue(wellnessEntriesAtom);
  const runBGContexts = useAtomValue(runBGContextsAtom);
  const calendarReload = useSetAtom(calendarReloadAtom);
  const raceDate = settings?.raceDate ?? "2026-06-13";

  const raceDist = settings?.raceDist ?? 16;
  const lthr = settings?.lthr ?? DEFAULT_LTHR;
  const totalWeeks = settings?.totalWeeks ?? 18;
  const startKm = settings?.startKm ?? 8;
  const [planEvents, setPlanEvents] = useState<WorkoutEvent[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // Adapt state
  const [isAdapting, setIsAdapting] = useState(false);
  const [adaptedEvents, setAdaptedEvents] = useState<AdaptedEvent[]>([]);
  const [adaptStatus, setAdaptStatus] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [optedIn, setOptedIn] = useState<Record<string, boolean>>({});

  const chartData = useWeeklyVolumeData(planEvents);

  const handleGenerate = () => {
    if (!apiKey) {
      setStatusMsg("Missing API Key");
      return;
    }
    if (settings?.hrZones?.length !== 5) {
      setStatusMsg("HR zones not synced from Intervals.icu");
      return;
    }
    const events = generatePlan(bgModel ?? null, raceDate, raceDist, totalWeeks, startKm, lthr, settings.hrZones, settings.includeBasePhase ?? false);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setPlanEvents(events.filter((e) => e.start_date_local >= today));
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
      setStatusMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setIsUploading(false);
  };

  // --- Adapt ---

  const hasPlannedEvents = calendarEvents.some((e) => e.type === "planned");

  const handleAdapt = async () => {
    if (!bgModel) {
      setAdaptStatus("BG model not ready");
      return;
    }

    setIsAdapting(true);
    setAdaptStatus("");
    setAdaptedEvents([]);
    setSyncDone(false);

    try {
      // Fitness from Intervals.icu wellness data (authoritative)
      const fitnessData = wellnessToFitnessData(wellnessEntries);
      const insights = computeInsights(fitnessData, calendarEvents);

      // Filter upcoming planned (next 4) + recent completed (last 7)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const upcoming = calendarEvents
        .filter((e) => e.type === "planned" && e.date >= today)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 4);

      const completed = calendarEvents
        .filter((e) => e.type === "completed")
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 7);

      if (upcoming.length === 0) {
        setAdaptStatus("No upcoming planned events found");
        setIsAdapting(false);
        return;
      }

      // Serialize runBGContexts (Map → Record)
      const bgContextRecord: Record<string, RunBGContext> = {};
      for (const [k, v] of runBGContexts) {
        bgContextRecord[k] = v;
      }

      const res = await fetch("/api/adapt-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcomingEvents: upcoming,
          recentCompleted: completed,
          bgModel,
          insights,
          runBGContexts: bgContextRecord,
          lthr,
          maxHr: settings?.maxHr,
          hrZones: settings?.hrZones,
          paceTable,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const data = (await res.json()) as { adaptedEvents: AdaptedEvent[] };
      setAdaptedEvents(data.adaptedEvents);
      setOptedIn({});
      setAdaptStatus(`Adapted ${data.adaptedEvents.length} workouts`);
    } catch (e) {
      setAdaptStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setIsAdapting(false);
  };

  // Auto-adapt trigger from feedback flow — fires once on mount when autoAdapt is true
  const autoAdaptFired = useRef(false);
  const onAutoAdapt = useEffectEvent(() => {
    if (!autoAdaptFired.current && !isAdapting) {
      autoAdaptFired.current = true;
      void handleAdapt();
    }
  });

  useEffect(() => {
    if (autoAdapt && bgModel && hasPlannedEvents) {
      onAutoAdapt();
    }
  }, [autoAdapt, bgModel, hasPlannedEvents]);

  const handleSync = async () => {
    if (!apiKey) {
      setAdaptStatus("Missing API Key");
      return;
    }

    const syncable = adaptedEvents.filter((e) => e.original.id.startsWith("event-"));
    if (syncable.length === 0) {
      setAdaptStatus("No events to sync");
      return;
    }

    const payload = buildSyncPayload(syncable, optedIn);

    if (payload.length === 0) {
      setAdaptStatus("No events to sync (all suggestions excluded)");
      return;
    }

    setIsSyncing(true);
    try {
      await Promise.all(
        payload.map(({ eventId, description, fuelRate }) =>
          updateEvent(apiKey, eventId, {
            description,
            ...(fuelRate != null && { carbs_per_hour: Math.round(fuelRate) }),
          }),
        ),
      );
      setAdaptStatus(`Synced ${payload.length} workouts to Intervals.icu`);
      setSyncDone(true);
      calendarReload();
    } catch (e) {
      setAdaptStatus(`Sync error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setIsSyncing(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#13101c]">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Fuel rates + Generate */}
        <div className="relative overflow-hidden bg-[#1d1828] border border-[#2e293c] rounded-xl p-4 md:p-5">
          <div className="absolute inset-0 bg-gradient-to-r from-[#f23b94]/5 via-transparent to-[#f23b94]/5 pointer-events-none" />
          <div className="relative flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#af9ece]">
                Fuel rates <span className="text-[#7a6899]">g/h</span>
              </span>
              <div className="grid grid-cols-3 gap-3 mt-2">
                {(["easy", "long", "interval"] as const).map((cat) => {
                  const rate = getCurrentFuelRate(cat, bgModel);
                  const isDefault = rate === DEFAULT_FUEL[cat] && !bgModel;
                  return (
                    <div key={cat} className="flex flex-col text-xs text-[#af9ece] gap-1">
                      <span className="capitalize">{cat}</span>
                      <span className={`text-sm font-medium ${isDefault ? "text-[#7a6899]" : "text-[#f23b94]"}`}>
                        {rate} g/h{isDefault ? " (default)" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <button
              onClick={handleGenerate}
              className="w-full md:w-auto md:min-w-[160px] py-2.5 px-6 bg-[#f23b94] text-white rounded-lg font-bold hover:bg-[#d42f7e] transition shadow-lg shadow-[#f23b94]/20 shrink-0"
            >
              Generate Plan
            </button>
          </div>
        </div>

        {planEvents.length > 0 && (
          <>
            <WeeklyVolumeChart data={chartData} />
            <ActionBar
              workoutCount={planEvents.length}
              isUploading={isUploading}
              statusMsg={statusMsg}
              onUpload={() => { void handleUpload(); }}
            />
            <WorkoutList events={planEvents} />
          </>
        )}

        {/* Adapt Upcoming */}
        {hasPlannedEvents && (
          <div className={`relative overflow-hidden bg-[#1d1828] border border-[#2e293c] ${isAdapting ? "border-l-[3px] border-l-[#f23b94]" : ""} rounded-xl p-4 md:p-5`}>
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wider ${isAdapting ? "text-white" : "text-[#af9ece]"}`}>
                  {isAdapting ? "Adapting..." : "Adapt Upcoming"}
                </span>
                <button
                  onClick={() => { void handleAdapt(); }}
                  disabled={isAdapting}
                  className={`py-2 px-5 text-white rounded-lg font-bold transition text-sm ${
                    isAdapting
                      ? "bg-[#d42c85] opacity-60 cursor-not-allowed"
                      : "bg-[#f23b94] hover:bg-[#d42f7e] shadow-lg shadow-[#f23b94]/20"
                  }`}
                >
                  {isAdapting ? <><span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Adapting</> : "Adapt"}
                </button>
              </div>

              {adaptStatus && !isAdapting && (
                <p className={`text-xs ${adaptStatus.startsWith("Error") ? "text-red-400" : "text-[#af9ece]"}`}>
                  {adaptStatus}
                </p>
              )}

              {/* Preview cards */}
              {adaptedEvents.length > 0 && (
                <div className="space-y-3">
                  {adaptedEvents.map((event) => (
                    <div key={event.original.id} className="bg-[#13101c] border border-[#2e293c] rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{event.name}</span>
                        <span className="text-xs text-[#7a6899]">{event.date}</span>
                        {event.changes.map((change, j) => {
                          const isLowConfidence = change.type === "fuel" && change.confidence === "low";
                          return (
                            <span
                              key={j}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                isLowConfidence
                                  ? "bg-[#f59e0b]/20 text-[#f59e0b] border border-dashed border-[#f59e0b]/30"
                                  : change.type === "fuel"
                                    ? "bg-[#f23b94]/20 text-[#f23b94] border border-[#f23b94]/30"
                                    : "bg-[#f23b94]/20 text-[#f23b94] border border-[#f23b94]/30"
                              }`}
                            >
                              {isLowConfidence ? "Suggestion" : change.type === "fuel" ? "Fuel" : "Swap"}
                            </span>
                          );
                        })}
                        {hasLowConfidenceFuel(event) && (
                          <label className="flex items-center gap-1 text-[10px] text-[#f59e0b] ml-auto cursor-pointer">
                            <input
                              type="checkbox"
                              checked={optedIn[event.original.id] ?? false}
                              onChange={(e) => {
                                setOptedIn((prev) => ({ ...prev, [event.original.id]: e.target.checked }));
                              }}
                              className="accent-[#f59e0b] w-3 h-3"
                            />
                            Include
                          </label>
                        )}
                      </div>
                      {event.notes && (
                        <div className="text-sm text-[#af9ece] leading-relaxed">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                              strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                              em: ({ children }) => <em className="text-[#af9ece]">{children}</em>,
                            }}
                          >
                            {event.notes}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ))}

                  <button
                    onClick={() => { void handleSync(); }}
                    disabled={isSyncing || syncDone}
                    className={`w-full py-2.5 rounded-lg font-bold transition text-sm ${
                      syncDone
                        ? "bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/30 cursor-default"
                        : isSyncing
                          ? "bg-[#d42c85] text-white opacity-60 cursor-not-allowed"
                          : "bg-[#f23b94]/10 text-[#f23b94] border border-[#f23b94]/30 hover:bg-[#f23b94]/20"
                    }`}
                  >
                    <span className="relative z-10">{syncDone ? "Synced \u2713" : isSyncing ? "Syncing..." : "Sync Changes"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
