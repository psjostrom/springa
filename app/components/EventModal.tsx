import { useEffect, useReducer } from "react";
import { format, isToday } from "date-fns";
import { enGB } from "date-fns/locale";
import { useAtomValue } from "jotai";
import type { CalendarEvent, PaceTable } from "@/lib/types";
import type { BGResponseModel } from "@/lib/bgModel";
import type { RunBGContext } from "@/lib/runBGContext";
import { updateEvent } from "@/lib/intervalsApi";
import { syncToGoogleCalendar } from "@/lib/googleCalendar";
import { parseEventId, formatPace } from "@/lib/format";
import { getWorkoutCategory } from "@/lib/constants";
import { getEventStatusBadge } from "@/lib/eventStyles";
import { useCurrentBG } from "../hooks/useCurrentBG";
import { currentTsbAtom, currentIobAtom } from "../atoms";
import { WorkoutCard } from "./WorkoutCard";
import { WorkoutStructureBar } from "./WorkoutStructureBar";
import { PreRunReadiness } from "./PreRunReadiness";
import { PreRunCarbsInput } from "./PreRunCarbsInput";
import { ClothingRecommendation } from "./ClothingRecommendation";
import { WidgetTabs } from "./WidgetTabs";
import { WorkoutGenerator } from "./WorkoutGenerator";
import type { ClothingRecommendation as ClothingRec } from "@/lib/clothingCalculator";

// --- Modal state machine ---

type EditMode =
  | { kind: "idle" }
  | { kind: "editing-date"; editDate: string }
  | { kind: "saving-date"; editDate: string }
  | { kind: "confirming-delete" }
  | { kind: "deleting" }
  | { kind: "replacing" };

interface ModalState {
  editMode: EditMode;
  error: string | null;
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
  | { type: "START_REPLACE" }
  | { type: "CANCEL" }
  | { type: "RESET" }
  | { type: "START_CLOSING" };

const INITIAL_MODAL_STATE: ModalState = { editMode: { kind: "idle" }, error: null, isClosing: false };

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
    case "START_REPLACE":
      return { ...state, editMode: { kind: "replacing" }, error: null };
    case "CANCEL":
      return { ...state, editMode: { kind: "idle" }, error: null };
    case "RESET":
      return INITIAL_MODAL_STATE;
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
  hrZones?: number[];
  lthr?: number;
  clothing?: ClothingRec;
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
  hrZones,
  lthr,
  clothing,
}: EventModalProps) {
  const [state, dispatch] = useReducer(modalReducer, INITIAL_MODAL_STATE);

  // Extract values from discriminated union for JSX convenience
  const { editMode } = state;
  const editDate = editMode.kind === "editing-date" || editMode.kind === "saving-date" ? editMode.editDate : "";

  // Pre-run readiness: show for today's planned events when BG is available
  const { currentBG, trend, trendSlope } = useCurrentBG();
  const currentTsb = useAtomValue(currentTsbAtom);
  const currentIob = useAtomValue(currentIobAtom);
  const showReadiness = !selectedEvent.activityId && isToday(selectedEvent.date) && currentBG != null;
  const workoutCategory = (() => {
    const raw = getWorkoutCategory(selectedEvent.name);
    return raw === "other" ? "easy" : raw;
  })();

  // When the BG model has a data-driven fuel rate for today's category, prefer it
  // over the static prescribed rate from the event.
  const modelFuelRate = (() => {
    if (!showReadiness || !bgModel) return null;
    const target = bgModel.targetFuelRates.find((t) => t.category === workoutCategory);
    return target?.targetFuelRate ?? null;
  })();

  useEffect(() => {
    dispatch({ type: "RESET" });
  }, [selectedEvent.id]);

  const handleClose = () => {
    dispatch({ type: "START_CLOSING" });
    if (window.innerWidth >= 640) {
      onClose(); // No animation on desktop
    }
    // On mobile, onClose fires via onAnimationEnd on the panel
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

      // Best-effort Google Calendar sync
      void syncToGoogleCalendar("update", {
        eventName: selectedEvent.name,
        eventDate: format(selectedEvent.date, "yyyy-MM-dd"),
        updates: { date: newDateLocal },
      });

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
        className={`bg-surface rounded-t-2xl sm:rounded-xl px-3 py-4 sm:p-6 w-full sm:max-w-3xl shadow-xl shadow-brand/10 border-t sm:border border-border max-h-[92vh] overflow-y-auto ${state.isClosing ? "animate-slide-down" : "animate-slide-up"}`}
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); }}
        onAnimationEnd={(e) => { if (state.isClosing && e.animationName === "slide-down") onClose(); }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            {editMode.kind === "editing-date" || editMode.kind === "saving-date" ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => { dispatch({ type: "SET_EDIT_DATE", date: e.target.value }); }}
                  className="border border-border bg-surface-alt text-text rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            ) : (
              <div className="text-sm text-muted mb-1">
                {format(selectedEvent.date, "EEEE d MMMM yyyy 'at' HH:mm", {
                  locale: enGB,
                })}
              </div>
            )}
            <h3 className="text-lg sm:text-xl font-bold text-text">
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
                  <>
                    <button
                      onClick={() => { dispatch({ type: "START_REPLACE" }); }}
                      className="px-3 py-1.5 text-sm bg-surface-alt hover:bg-border text-muted rounded-lg transition"
                    >
                      Replace
                    </button>
                    <button
                      onClick={() => { dispatch({ type: "START_EDIT_DATE", date: format(selectedEvent.date, "yyyy-MM-dd'T'HH:mm") }); }}
                      className="px-3 py-1.5 text-sm bg-surface-alt hover:bg-border text-muted rounded-lg transition"
                    >
                      Edit
                    </button>
                  </>
                )}
                <button
                  onClick={() => { dispatch({ type: "CONFIRM_DELETE" }); }}
                  className="px-3 py-1.5 text-sm bg-tint-error hover:bg-border text-text rounded-lg transition"
                >
                  Delete
                </button>
              </>
            )}
            {(editMode.kind === "confirming-delete" || editMode.kind === "deleting") && (
              <>
                <span className="text-sm text-error">Delete this workout?</span>
                <button
                  onClick={() => {
                    dispatch({ type: "DELETE" });
                    void onDelete(selectedEvent.id).catch(() => {
                      dispatch({ type: "DELETE_FAILED", error: "Failed to delete event. Please try again." });
                    });
                  }}
                  disabled={editMode.kind === "deleting"}
                  className="px-3 py-1.5 text-sm bg-error hover:brightness-110 text-white rounded-lg transition disabled:opacity-50"
                >
                  {editMode.kind === "deleting" ? "Deleting..." : "Confirm"}
                </button>
                <button
                  onClick={() => { dispatch({ type: "CANCEL" }); }}
                  disabled={editMode.kind === "deleting"}
                  className="px-3 py-1.5 text-sm bg-surface-alt hover:bg-border text-muted rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
            {(editMode.kind === "editing-date" || editMode.kind === "saving-date") && (
              <>
                <button
                  onClick={() => { void saveEventEdit(); }}
                  disabled={editMode.kind === "saving-date"}
                  className="px-3 py-1.5 text-sm bg-brand hover:bg-brand-hover text-white rounded-lg transition disabled:opacity-50"
                >
                  {editMode.kind === "saving-date" ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => { dispatch({ type: "CANCEL" }); }}
                  disabled={editMode.kind === "saving-date"}
                  className="px-3 py-1.5 text-sm bg-surface-alt hover:bg-border text-muted rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
            <button
              onClick={handleClose}
              className="text-muted hover:text-text text-xl"
            >
              ✕
            </button>
          </div>
        </div>

        {state.error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-tint-error text-text text-sm">
            {state.error}
          </div>
        )}

        {editMode.kind === "replacing" && (
          <WorkoutGenerator
            date={selectedEvent.date}
            existingEventId={parseEventId(selectedEvent.id)}
            existingEventName={selectedEvent.name}
            onGenerated={handleClose}
            onCancel={() => { dispatch({ type: "CANCEL" }); }}
          />
        )}

        {editMode.kind !== "replacing" && showReadiness && (
          <PreRunReadiness
            currentBG={currentBG}
            trendSlope={trendSlope}
            trend={trend}
            bgModel={bgModel ?? null}
            category={workoutCategory}
            currentTsb={currentTsb}
            iob={currentIob}
          />
        )}

        {editMode.kind !== "replacing" && !selectedEvent.activityId && selectedEvent.type === "planned" && (
          <PreRunCarbsInput eventId={selectedEvent.id} />
        )}

        {editMode.kind !== "replacing" && clothing && selectedEvent.type === "planned" && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-surface-alt border border-border">
            <div className="text-xs text-muted uppercase tracking-wider font-semibold mb-1.5">What to wear</div>
            <ClothingRecommendation recommendation={clothing} />
          </div>
        )}

        {editMode.kind !== "replacing" && selectedEvent.description && selectedEvent.type === "planned" && (
          <WorkoutCard description={selectedEvent.description} fuelRate={selectedEvent.fuelRate} fuelRateNote={modelFuelRate != null && modelFuelRate !== selectedEvent.fuelRate ? "plan" : undefined} totalCarbs={selectedEvent.totalCarbs} paceTable={paceTable} hrZones={hrZones} lthr={lthr}>
            <WorkoutStructureBar description={selectedEvent.description} maxHeight={48} hrZones={hrZones} lthr={lthr} />
          </WorkoutCard>
        )}

        {selectedEvent.type === "completed" && (
          <>
            {/* Primary stats strip */}
            <div className="bg-surface-alt rounded-lg px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
              {selectedEvent.distance && (
                <div>
                  <div className="text-muted text-sm">Distance</div>
                  <div className="font-semibold text-text">
                    {(selectedEvent.distance / 1000).toFixed(2)} km
                  </div>
                </div>
              )}
              {selectedEvent.duration && (
                <div>
                  <div className="text-muted text-sm">Duration</div>
                  <div className="font-semibold text-text">
                    {Math.floor(selectedEvent.duration / 60)} min
                  </div>
                </div>
              )}
              {selectedEvent.pace && (
                <div>
                  <div className="text-muted text-sm">Pace</div>
                  <div className="font-semibold text-text">
                    {formatPace(selectedEvent.pace)} /km
                  </div>
                </div>
              )}
              {selectedEvent.avgHr && (
                <div>
                  <div className="text-muted text-sm">Avg HR</div>
                  <div className="font-semibold text-text">
                    {selectedEvent.avgHr} bpm
                  </div>
                </div>
              )}
            </div>

            {/* Tabbed widget system */}
            <WidgetTabs
              widgetProps={{
                event: selectedEvent,
                isLoadingStreamData,
                runBGContext: selectedEvent.activityId ? runBGContexts?.get(selectedEvent.activityId) : undefined,
                bgModel,
                paceTable,
                hrZones,
                lthr,
                apiKey,
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
