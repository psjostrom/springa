import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from "react";
import { format, isToday } from "date-fns";
import { enGB } from "date-fns/locale";
import { Info, Pencil } from "lucide-react";
import type { CalendarEvent, PaceTable } from "@/lib/types";
import type { BGResponseModel } from "@/lib/bgModel";
import type { RunBGContext } from "@/lib/runBGContext";
import { updateEvent, updateActivityCarbs } from "@/lib/intervalsApi";
import { parseEventId, formatPace } from "@/lib/format";
import { getWorkoutCategory } from "@/lib/constants";
import { getEventStatusBadge } from "@/lib/eventStyles";
import { useCurrentBG } from "../hooks/useCurrentBG";
import { HRZoneBreakdown } from "./HRZoneBreakdown";
import { WorkoutStreamGraph } from "./WorkoutStreamGraph";
import { WorkoutCard } from "./WorkoutCard";
import { RunReportCard } from "./RunReportCard";
import { RunAnalysis } from "./RunAnalysis";
import { WorkoutStructureBar } from "./WorkoutStructureBar";
import { HRMiniChart } from "./HRMiniChart";
import { PreRunReadiness } from "./PreRunReadiness";

function StatInfo({ label, tip }: { label: string; tip: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const close = useCallback(
    (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    },
    [],
  );

  useEffect(() => {
    if (open) document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [open, close]);

  return (
    <span ref={ref} className="relative inline-flex items-center gap-0.5">
      {label}
      <button
        type="button"
        aria-label={`Info about ${label.split(" ")[0].toLowerCase()}`}
        onClick={() => setOpen((v) => !v)}
        className="text-[#b8a5d4] hover:text-white transition-colors"
      >
        <Info className="w-3 h-3" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 rounded-lg bg-[#0d0a1a] text-white text-sm leading-relaxed px-3 py-2 shadow-lg border border-[#3d2b5a] z-10">
          {tip}
        </span>
      )}
    </span>
  );
}

// --- Modal state machine ---

type EditMode =
  | { kind: "idle" }
  | { kind: "editing-date"; editDate: string }
  | { kind: "saving-date"; editDate: string }
  | { kind: "confirming-delete" }
  | { kind: "deleting" }
  | { kind: "editing-carbs"; carbsValue: string }
  | { kind: "saving-carbs"; carbsValue: string };

interface ModalState {
  editMode: EditMode;
  error: string | null;
  savedCarbs: number | null;
  isClosing: boolean;
}

type ModalAction =
  | { type: "START_EDIT_DATE"; date: string }
  | { type: "SET_EDIT_DATE"; date: string }
  | { type: "SAVE_DATE" }
  | { type: "DATE_SAVED" }
  | { type: "DATE_SAVE_FAILED"; error: string }
  | { type: "CONFIRM_DELETE" }
  | { type: "DELETE" }
  | { type: "DELETE_FAILED"; error: string }
  | { type: "START_EDIT_CARBS"; value: string }
  | { type: "SET_CARBS_VALUE"; value: string }
  | { type: "SAVE_CARBS" }
  | { type: "CARBS_SAVED" }
  | { type: "CANCEL" }
  | { type: "RESET" }
  | { type: "SET_SAVED_CARBS"; value: number | null }
  | { type: "START_CLOSING" };

const INITIAL_MODAL_STATE: ModalState = { editMode: { kind: "idle" }, error: null, savedCarbs: null, isClosing: false };

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "START_EDIT_DATE":
      return { ...state, editMode: { kind: "editing-date", editDate: action.date }, error: null };
    case "SET_EDIT_DATE":
      if (state.editMode.kind !== "editing-date") return state;
      return { ...state, editMode: { ...state.editMode, editDate: action.date } };
    case "SAVE_DATE":
      if (state.editMode.kind !== "editing-date") return state;
      return { ...state, editMode: { kind: "saving-date", editDate: state.editMode.editDate } };
    case "DATE_SAVED":
      return INITIAL_MODAL_STATE;
    case "DATE_SAVE_FAILED":
      if (state.editMode.kind !== "saving-date") return state;
      return { ...state, editMode: { kind: "editing-date", editDate: state.editMode.editDate }, error: action.error };
    case "CONFIRM_DELETE":
      return { ...state, editMode: { kind: "confirming-delete" }, error: null };
    case "DELETE":
      return { ...state, editMode: { kind: "deleting" } };
    case "DELETE_FAILED":
      return { ...state, editMode: { kind: "confirming-delete" }, error: action.error };
    case "START_EDIT_CARBS":
      return { ...state, editMode: { kind: "editing-carbs", carbsValue: action.value }, error: null };
    case "SET_CARBS_VALUE":
      if (state.editMode.kind !== "editing-carbs") return state;
      return { ...state, editMode: { ...state.editMode, carbsValue: action.value } };
    case "SAVE_CARBS":
      if (state.editMode.kind !== "editing-carbs") return state;
      return { ...state, editMode: { kind: "saving-carbs", carbsValue: state.editMode.carbsValue } };
    case "CARBS_SAVED":
    case "CANCEL":
      return { ...state, editMode: { kind: "idle" } as EditMode, error: null };
    case "RESET":
      return INITIAL_MODAL_STATE;
    case "SET_SAVED_CARBS":
      return { ...state, savedCarbs: action.value };
    case "START_CLOSING":
      return { ...state, isClosing: true };
  }
}

interface EventModalProps {
  event: CalendarEvent;
  onClose: () => void;
  onDateSaved: (eventId: string, newDate: Date) => void;
  onDelete: (eventId: string) => Promise<void>;
  /** Only relevant for completed events — shows a spinner while stream data loads. */
  isLoadingStreamData?: boolean;
  apiKey: string;
  runBGContexts?: Map<string, RunBGContext>;
  paceTable?: PaceTable;
  bgModel?: BGResponseModel | null;
}

export function EventModal({
  event: selectedEvent,
  onClose,
  onDateSaved,
  onDelete,
  isLoadingStreamData,
  apiKey,
  runBGContexts,
  paceTable,
  bgModel,
}: EventModalProps) {
  const [state, dispatch] = useReducer(modalReducer, INITIAL_MODAL_STATE);

  // Extract values from discriminated union for JSX convenience
  const { editMode } = state;
  const editDate = editMode.kind === "editing-date" || editMode.kind === "saving-date" ? editMode.editDate : "";
  const carbsValue = editMode.kind === "editing-carbs" || editMode.kind === "saving-carbs" ? editMode.carbsValue : "";

  // Pre-run readiness: show for today's planned events when BG is available
  const { currentBG, trend, trendSlope } = useCurrentBG();
  const showReadiness = !selectedEvent.activityId && isToday(selectedEvent.date) && currentBG != null;
  const workoutCategory = useMemo(() => {
    const raw = getWorkoutCategory(selectedEvent.name);
    return raw === "other" ? "easy" : raw;
  }, [selectedEvent.name]);

  // When the BG model has a data-driven fuel rate for today's category, prefer it
  // over the static prescribed rate from the event.
  const modelFuelRate = useMemo(() => {
    if (!showReadiness || !bgModel) return null;
    const target = bgModel.targetFuelRates.find((t) => t.category === workoutCategory);
    return target?.targetFuelRate ?? null;
  }, [showReadiness, bgModel, workoutCategory]);

  useEffect(() => {
    dispatch({ type: "RESET" });
  }, [selectedEvent.id]);

  const handleClose = useCallback(() => {
    dispatch({ type: "START_CLOSING" });
    const isMobile = window.innerWidth < 640;
    if (isMobile) {
      setTimeout(onClose, 250);
    } else {
      onClose();
    }
  }, [onClose]);

  const saveCarbs = async () => {
    const val = parseInt(carbsValue, 10);
    if (isNaN(val) || val < 0) return;
    const actId = selectedEvent.activityId;
    if (!actId) return;

    dispatch({ type: "SAVE_CARBS" });
    try {
      await updateActivityCarbs(apiKey, actId, val);
      dispatch({ type: "SET_SAVED_CARBS", value: val });
      dispatch({ type: "CARBS_SAVED" });
    } catch (err) {
      console.error("Failed to update carbs:", err);
      dispatch({ type: "CANCEL" });
    }
  };

  const saveEventEdit = async () => {
    if (!editDate) return;
    const numericId = parseEventId(selectedEvent.id);
    if (isNaN(numericId)) return;

    dispatch({ type: "SAVE_DATE" });
    try {
      const newDateLocal = editDate.includes("T")
        ? editDate + ":00"
        : editDate + "T12:00:00";
      await updateEvent(apiKey, numericId, { start_date_local: newDateLocal });

      const newDate = new Date(newDateLocal);
      onDateSaved(selectedEvent.id, newDate);
      dispatch({ type: "DATE_SAVED" });
    } catch (err) {
      console.error("Failed to update event:", err);
      dispatch({ type: "DATE_SAVE_FAILED", error: "Failed to update event. Please try again." });
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4 transition-colors duration-250 ${state.isClosing ? "bg-black/0" : "bg-black/70"}`}
      onClick={handleClose}
    >
      <div
        className={`bg-[#1e1535] rounded-t-2xl sm:rounded-xl px-3 py-4 sm:p-6 w-full sm:max-w-3xl shadow-xl shadow-[#ff2d95]/10 border-t sm:border border-[#3d2b5a] max-h-[92vh] overflow-y-auto ${state.isClosing ? "animate-slide-down" : "animate-slide-up"}`}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            {editMode.kind === "editing-date" || editMode.kind === "saving-date" ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => dispatch({ type: "SET_EDIT_DATE", date: e.target.value })}
                  className="border border-[#3d2b5a] bg-[#1a1030] text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
                />
              </div>
            ) : (
              <div className="text-sm text-[#c4b5fd] mb-1">
                {format(selectedEvent.date, "EEEE d MMMM yyyy 'at' HH:mm", {
                  locale: enGB,
                })}
              </div>
            )}
            <h3 className="text-lg sm:text-xl font-bold text-white">
              {selectedEvent.name}
            </h3>
            {(() => {
              const badge = getEventStatusBadge(selectedEvent);
              return (
                <div className={`inline-block px-2 py-1 rounded text-sm font-medium mt-2 ${badge.className}`}>
                  {badge.label}
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            {editMode.kind === "idle" && (
              <>
                {selectedEvent.type === "planned" && (
                  <button
                    onClick={() => dispatch({ type: "START_EDIT_DATE", date: format(selectedEvent.date, "yyyy-MM-dd'T'HH:mm") })}
                    className="px-3 py-1.5 text-sm bg-[#2a1f3d] hover:bg-[#3d2b5a] text-[#c4b5fd] rounded-lg transition"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => dispatch({ type: "CONFIRM_DELETE" })}
                  className="px-3 py-1.5 text-sm bg-[#3d1525] hover:bg-[#5a1f3a] text-[#ff6b8a] rounded-lg transition"
                >
                  Delete
                </button>
              </>
            )}
            {(editMode.kind === "confirming-delete" || editMode.kind === "deleting") && (
              <>
                <span className="text-sm text-[#ff6b8a]">Delete this workout?</span>
                <button
                  onClick={async () => {
                    dispatch({ type: "DELETE" });
                    try {
                      await onDelete(selectedEvent.id);
                    } catch {
                      dispatch({ type: "DELETE_FAILED", error: "Failed to delete event. Please try again." });
                    }
                  }}
                  disabled={editMode.kind === "deleting"}
                  className="px-3 py-1.5 text-sm bg-[#ff3366] hover:bg-[#e0294f] text-white rounded-lg transition disabled:opacity-50"
                >
                  {editMode.kind === "deleting" ? "Deleting..." : "Confirm"}
                </button>
                <button
                  onClick={() => dispatch({ type: "CANCEL" })}
                  disabled={editMode.kind === "deleting"}
                  className="px-3 py-1.5 text-sm bg-[#2a1f3d] hover:bg-[#3d2b5a] text-[#c4b5fd] rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
            {(editMode.kind === "editing-date" || editMode.kind === "saving-date") && (
              <>
                <button
                  onClick={saveEventEdit}
                  disabled={editMode.kind === "saving-date"}
                  className="px-3 py-1.5 text-sm bg-[#ff2d95] hover:bg-[#e0207a] text-white rounded-lg transition disabled:opacity-50"
                >
                  {editMode.kind === "saving-date" ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => dispatch({ type: "CANCEL" })}
                  disabled={editMode.kind === "saving-date"}
                  className="px-3 py-1.5 text-sm bg-[#2a1f3d] hover:bg-[#3d2b5a] text-[#c4b5fd] rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
            <button
              onClick={handleClose}
              className="text-[#b8a5d4] hover:text-white text-xl"
            >
              ✕
            </button>
          </div>
        </div>

        {state.error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-[#3d1525] text-[#ff6b8a] text-sm">
            {state.error}
          </div>
        )}

        {showReadiness && currentBG != null && (
          <PreRunReadiness
            currentBG={currentBG}
            trendSlope={trendSlope}
            trend={trend}
            bgModel={bgModel ?? null}
            category={workoutCategory}
          />
        )}

        {selectedEvent.description && (
          <WorkoutCard description={selectedEvent.description} fuelRate={selectedEvent.fuelRate} fuelRateNote={modelFuelRate != null && modelFuelRate !== selectedEvent.fuelRate ? "plan" : undefined} totalCarbs={selectedEvent.totalCarbs} paceTable={paceTable}>
            {selectedEvent.type === "completed" ? (
              selectedEvent.hrZones ? (
                <HRMiniChart
                  z1={selectedEvent.hrZones.z1}
                  z2={selectedEvent.hrZones.z2}
                  z3={selectedEvent.hrZones.z3}
                  z4={selectedEvent.hrZones.z4}
                  z5={selectedEvent.hrZones.z5}
                  maxHeight={48}
                  hrData={selectedEvent.streamData?.heartrate}
                />
              ) : isLoadingStreamData ? (
                <div className="skeleton h-12 w-full rounded" />
              ) : null
            ) : (
              <WorkoutStructureBar description={selectedEvent.description} maxHeight={48} />
            )}
          </WorkoutCard>
        )}

        {selectedEvent.type === "completed" && (
          <div className="space-y-4">
            {/* Stats card */}
            <div className="border-t border-[#3d2b5a] pt-4 mt-4">
              {/* Primary stats — top strip */}
              <div className="bg-[#2a1f3d] rounded-lg px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {selectedEvent.distance && (
                  <div>
                    <div className="text-[#b8a5d4] text-sm">Distance</div>
                    <div className="font-semibold text-white">
                      {(selectedEvent.distance / 1000).toFixed(2)} km
                    </div>
                  </div>
                )}
                {selectedEvent.duration && (
                  <div>
                    <div className="text-[#b8a5d4] text-sm">Duration</div>
                    <div className="font-semibold text-white">
                      {Math.floor(selectedEvent.duration / 60)} min
                    </div>
                  </div>
                )}
                {selectedEvent.pace && (
                  <div>
                    <div className="text-[#b8a5d4] text-sm">Pace</div>
                    <div className="font-semibold text-white">
                      {formatPace(selectedEvent.pace)} /km
                    </div>
                  </div>
                )}
                {selectedEvent.avgHr && (
                  <div>
                    <div className="text-[#b8a5d4] text-sm">Avg HR</div>
                    <div className="font-semibold text-white">
                      {selectedEvent.avgHr} bpm
                    </div>
                  </div>
                )}
              </div>

              {/* Secondary stats — bottom row */}
              {(() => {
                const items: React.ReactNode[] = [];
                if (selectedEvent.calories) items.push(<span key="cal">{selectedEvent.calories} kcal</span>);
                if (selectedEvent.cadence) items.push(<span key="cad">{Math.round(selectedEvent.cadence)} spm</span>);
                if (selectedEvent.maxHr) items.push(<span key="mhr">Max HR {selectedEvent.maxHr} bpm</span>);
                if (selectedEvent.load) items.push(<StatInfo key="load" label={`Load ${Math.round(selectedEvent.load)}`} tip="Training load estimates how hard an activity was relative to your capabilities. It is calculated from heart rate and pace. 1 hour at threshold is roughly 100 load." />);
                if (selectedEvent.intensity !== undefined) items.push(<StatInfo key="int" label={`Intensity ${Math.round(selectedEvent.intensity)}%`} tip="Intensity measures how hard the activity was compared to your threshold. Over 100% for an hour or longer suggests your threshold setting is too low." />);
                if (items.length === 0) return null;
                return (
                  <div className="px-4 py-2 flex flex-wrap items-center gap-x-1 text-sm text-[#b8a5d4]">
                    {items.flatMap((item, i) => i > 0 ? [<span key={`sep-${i}`}>·</span>, item] : [item])}
                  </div>
                );
              })()}
            </div>

            {/* Report Card */}
            <RunReportCard event={selectedEvent} isLoadingStreamData={isLoadingStreamData} runBGContext={selectedEvent.activityId ? runBGContexts?.get(selectedEvent.activityId) : undefined} />

            {/* Run Analysis */}
            {selectedEvent.activityId && (
              <RunAnalysis event={selectedEvent} runBGContext={selectedEvent.activityId ? runBGContexts?.get(selectedEvent.activityId) : undefined} />
            )}

            {/* Carbs ingested */}
            <div className="border-t border-[#3d2b5a] pt-3 mt-4 px-0">
              <div className="flex items-center justify-between">
                <div className="text-sm text-[#b8a5d4]">Carbs ingested</div>
                {editMode.kind === "editing-carbs" || editMode.kind === "saving-carbs" ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={carbsValue}
                      onChange={(e) => dispatch({ type: "SET_CARBS_VALUE", value: e.target.value })}
                      className="w-16 border border-[#3d2b5a] bg-[#1a1030] text-white rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveCarbs();
                        if (e.key === "Escape") dispatch({ type: "CANCEL" });
                      }}
                    />
                    <span className="text-sm text-[#b8a5d4]">g</span>
                    <button
                      onClick={saveCarbs}
                      disabled={editMode.kind === "saving-carbs"}
                      className="px-2 py-1 text-xs bg-[#ff2d95] hover:bg-[#e0207a] text-white rounded transition disabled:opacity-50"
                    >
                      {editMode.kind === "saving-carbs" ? "..." : "Save"}
                    </button>
                    <button
                      onClick={() => dispatch({ type: "CANCEL" })}
                      disabled={editMode.kind === "saving-carbs"}
                      className="px-2 py-1 text-xs bg-[#2a1f3d] hover:bg-[#3d2b5a] text-[#c4b5fd] rounded transition"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const current = state.savedCarbs ?? selectedEvent.carbsIngested ?? selectedEvent.totalCarbs ?? 0;
                      dispatch({ type: "START_EDIT_CARBS", value: String(current) });
                    }}
                    className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-[#ff2d95] transition"
                  >
                    {state.savedCarbs ?? selectedEvent.carbsIngested ?? selectedEvent.totalCarbs ?? "—"}g
                    {selectedEvent.carbsIngested == null && state.savedCarbs == null && (
                      <span className="text-xs font-normal text-[#b8a5d4]">(planned)</span>
                    )}
                    <Pencil className="w-3 h-3 text-[#b8a5d4]" />
                  </button>
                )}
              </div>
            </div>

            {/* HR Zones */}
            {selectedEvent.hrZones ? (
              <div className="border-t border-[#3d2b5a] pt-4 mt-4">
                <div className="text-sm font-semibold text-[#c4b5fd] mb-3">
                  Heart Rate Zones
                </div>
                <HRZoneBreakdown
                  z1={selectedEvent.hrZones.z1}
                  z2={selectedEvent.hrZones.z2}
                  z3={selectedEvent.hrZones.z3}
                  z4={selectedEvent.hrZones.z4}
                  z5={selectedEvent.hrZones.z5}
                />
              </div>
            ) : isLoadingStreamData ? (
              <div className="border-t border-[#3d2b5a] pt-4 mt-4">
                <div className="text-sm font-semibold text-[#c4b5fd] mb-3">
                  Heart Rate Zones
                </div>
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="skeleton h-5 w-full" />
                  ))}
                </div>
              </div>
            ) : null}

            {/* Stream Graph */}
            {selectedEvent.streamData &&
            Object.keys(selectedEvent.streamData).length > 0 ? (
              <div className="border-t border-[#3d2b5a] pt-4 mt-4">
                <WorkoutStreamGraph streamData={selectedEvent.streamData} />
              </div>
            ) : isLoadingStreamData ? (
              <div className="border-t border-[#3d2b5a] pt-4 mt-4">
                <div className="skeleton h-40 w-full" />
              </div>
            ) : selectedEvent.type === "completed" ? (
              <div className="border-t border-[#3d2b5a] pt-4 mt-4">
                <div className="text-sm text-[#b8a5d4] italic">
                  Detailed workout data (graphs) not available for this
                  activity
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
