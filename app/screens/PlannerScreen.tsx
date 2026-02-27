"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { WorkoutEvent, CalendarEvent } from "@/lib/types";
import type { BGResponseModel } from "@/lib/bgModel";
import type { RunBGContext } from "@/lib/runBGContext";
import type { AdaptedEvent } from "@/lib/adaptPlan";
import { uploadToIntervals, updateEvent } from "@/lib/intervalsApi";
import { generatePlan } from "@/lib/workoutGenerators";
import { computeFitnessData, computeInsights } from "@/lib/fitness";
import { WeeklyVolumeChart } from "../components/WeeklyVolumeChart";
import { WorkoutList } from "../components/WorkoutList";
import { ActionBar } from "../components/ActionBar";
import { useWeeklyVolumeData } from "../hooks/useWeeklyVolumeData";
import { getCurrentFuelRate, DEFAULT_FUEL } from "@/lib/fuelRate";

interface PlannerScreenProps {
  apiKey: string;
  bgModel?: BGResponseModel | null;
  raceDate: string;
  raceName?: string;
  raceDist?: number;
  prefix?: string;
  totalWeeks?: number;
  startKm?: number;
  lthr?: number;
  events?: CalendarEvent[];
  runBGContexts?: Map<string, RunBGContext>;
  autoAdapt?: boolean;
  onSyncDone?: () => void;
}

export function PlannerScreen({ apiKey, bgModel, raceDate, ...props }: PlannerScreenProps) {
  const raceDist = props.raceDist ?? 16;
  const lthr = props.lthr ?? 169;
  const prefix = props.prefix ?? "eco16";
  const totalWeeks = props.totalWeeks ?? 18;
  const startKm = props.startKm ?? 8;
  const [planEvents, setPlanEvents] = useState<WorkoutEvent[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // Adapt state
  const [isAdapting, setIsAdapting] = useState(false);
  const [adaptedEvents, setAdaptedEvents] = useState<AdaptedEvent[]>([]);
  const [adaptStatus, setAdaptStatus] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  const chartData = useWeeklyVolumeData(planEvents);

  const handleGenerate = useCallback(() => {
    if (!apiKey) {
      setStatusMsg("Missing API Key");
      return;
    }
    const events = generatePlan(bgModel ?? null, raceDate, raceDist, prefix, totalWeeks, startKm, lthr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setPlanEvents(events.filter((e) => e.start_date_local >= today));
    setStatusMsg("");
  }, [apiKey, bgModel, raceDate, raceDist, prefix, totalWeeks, startKm, lthr]);

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
      setStatusMsg(`Error: ${e}`);
    }
    setIsUploading(false);
  };

  // --- Adapt ---

  const calendarEvents = props.events ?? [];
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
      // Compute fitness locally
      const fitnessData = computeFitnessData(calendarEvents);
      const insights = computeInsights(fitnessData, calendarEvents);

      // Filter upcoming planned (next 4) + recent completed (last 7)
      const now = new Date();
      const upcoming = calendarEvents
        .filter((e) => e.type === "planned" && e.date >= now)
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
      if (props.runBGContexts) {
        for (const [k, v] of props.runBGContexts) {
          bgContextRecord[k] = v;
        }
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
          prefix,
          lthr,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const data = await res.json();
      setAdaptedEvents(data.adaptedEvents);
      setAdaptStatus(`Adapted ${data.adaptedEvents.length} workouts`);
    } catch (e) {
      setAdaptStatus(`Error: ${e}`);
    }
    setIsAdapting(false);
  };

  // Auto-adapt trigger from feedback flow — fires once on mount when autoAdapt is true
  const autoAdaptFired = useRef(false);
  useEffect(() => {
    if (props.autoAdapt && !autoAdaptFired.current && !isAdapting && bgModel && hasPlannedEvents) {
      autoAdaptFired.current = true;
      handleAdapt();
    }
  }, [props.autoAdapt, bgModel, hasPlannedEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSync = async () => {
    if (!apiKey) {
      setAdaptStatus("Missing API Key");
      return;
    }

    // Extract numeric Intervals.icu event IDs from adapted events
    const syncable = adaptedEvents.filter((e) => e.original.id.startsWith("event-"));
    if (syncable.length === 0) {
      setAdaptStatus("No events to sync");
      return;
    }

    setIsSyncing(true);
    try {
      await Promise.all(
        syncable.map((e) => {
          const eventId = Number(e.original.id.replace("event-", ""));
          return updateEvent(apiKey, eventId, {
            description: e.description,
            ...(e.fuelRate != null && { carbs_per_hour: Math.round(e.fuelRate) }),
          });
        }),
      );
      setAdaptStatus(`Synced ${syncable.length} workouts to Intervals.icu`);
      setSyncDone(true);
      props.onSyncDone?.();
    } catch (e) {
      setAdaptStatus(`Sync error: ${e}`);
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
              onUpload={handleUpload}
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
                  onClick={handleAdapt}
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
                        {event.changes.map((change, j) => (
                          <span
                            key={j}
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              change.type === "fuel"
                                ? "bg-[#ff2d95]/20 text-[#ff2d95] border border-[#ff2d95]/30"
                                : "bg-[#00ffff]/20 text-[#00ffff] border border-[#00ffff]/30"
                            }`}
                          >
                            {change.type === "fuel" ? "Fuel" : "Swap"}
                          </span>
                        ))}
                      </div>
                      {event.notes && (
                        <div className="text-xs text-[#b8a5d4] leading-relaxed">
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
                    onClick={handleSync}
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
