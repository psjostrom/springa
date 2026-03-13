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
    <div className="h-full overflow-y-auto bg-[#0d0a1a]">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Fuel rates + Generate */}
        <div className="relative overflow-hidden bg-[#1e1535] border border-[#3d2b5a] rounded-xl p-4 md:p-5">
          <div className="absolute inset-0 bg-gradient-to-r from-[#ff2d95]/5 via-transparent to-[#6c3aed]/5 pointer-events-none" />
          <div className="relative flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#b8a5d4]">
                Fuel rates <span className="text-[#7a6899]">g/h</span>
              </span>
              <div className="grid grid-cols-3 gap-3 mt-2">
                {(["easy", "long", "interval"] as const).map((cat) => {
                  const rate = getCurrentFuelRate(cat, bgModel);
                  const isDefault = rate === DEFAULT_FUEL[cat] && !bgModel;
                  return (
                    <div key={cat} className="flex flex-col text-xs text-[#b8a5d4] gap-1">
                      <span className="capitalize">{cat}</span>
                      <span className={`text-sm font-medium ${isDefault ? "text-[#7a6899]" : "text-[#ff2d95]"}`}>
                        {rate} g/h{isDefault ? " (default)" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <button
              onClick={handleGenerate}
              className="w-full md:w-auto md:min-w-[160px] py-2.5 px-6 bg-[#ff2d95] text-white rounded-lg font-bold hover:bg-[#e0207a] transition shadow-lg shadow-[#ff2d95]/20 shrink-0"
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
          <div className={isAdapting ? "retro-adapt-border rounded-xl" : ""}>
          <div className={`relative overflow-hidden bg-[#1e1535] ${isAdapting ? "rounded-[0.65rem]" : "border border-[#3d2b5a] rounded-xl"} p-4 md:p-5`}>
            <div className="absolute inset-0 bg-gradient-to-r from-[#6c3aed]/5 via-transparent to-[#00ffff]/5 pointer-events-none" />
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wider ${isAdapting ? "text-[#00ffff] retro-text-flicker" : "text-[#b8a5d4]"}`}>
                  {isAdapting ? "Adapting..." : "Adapt Upcoming"}
                </span>
                <button
                  onClick={() => { void handleAdapt(); }}
                  disabled={isAdapting}
                  className={`py-2 px-5 text-white rounded-lg font-bold transition text-sm ${
                    isAdapting
                      ? "retro-btn-adapting cursor-not-allowed"
                      : "bg-[#6c3aed] hover:bg-[#5b2ec7] shadow-lg shadow-[#6c3aed]/20"
                  }`}
                >
                  {isAdapting ? <span className="relative z-10">Adapting...</span> : "Adapt"}
                </button>
              </div>

              {adaptStatus && !isAdapting && (
                <p className={`text-xs ${adaptStatus.startsWith("Error") ? "text-red-400" : "text-[#00ffff]"}`}>
                  {adaptStatus}
                </p>
              )}

              {/* Preview cards */}
              {adaptedEvents.length > 0 && (
                <div className="space-y-3">
                  {adaptedEvents.map((event) => (
                    <div key={event.original.id} className="bg-[#1a1030] border border-[#3d2b5a] rounded-lg p-3 space-y-2">
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
                                    ? "bg-[#ff2d95]/20 text-[#ff2d95] border border-[#ff2d95]/30"
                                    : "bg-[#00ffff]/20 text-[#00ffff] border border-[#00ffff]/30"
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
                        <div className="text-sm text-[#b8a5d4] leading-relaxed">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                              strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                              em: ({ children }) => <em className="text-[#c4b5fd]">{children}</em>,
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
                          ? "retro-btn-uploading text-white cursor-not-allowed"
                          : "bg-[#00ffff]/10 text-[#00ffff] border border-[#00ffff]/30 hover:bg-[#00ffff]/20"
                    }`}
                  >
                    <span className="relative z-10">{syncDone ? "Synced \u2713" : isSyncing ? "Syncing..." : "Sync Changes"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
