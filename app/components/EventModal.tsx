import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import { Info, Loader2 } from "lucide-react";
import type { CalendarEvent, PaceTable } from "@/lib/types";
import { updateEvent } from "@/lib/intervalsApi";
import { getEventStyle } from "@/lib/eventStyles";
import { HRZoneBreakdown } from "./HRZoneBreakdown";
import { WorkoutStreamGraph } from "./WorkoutStreamGraph";
import { WorkoutCard } from "./WorkoutCard";

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
        className="text-slate-400 hover:text-slate-600 transition-colors"
      >
        <Info className="w-3 h-3" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 rounded-lg bg-slate-800 text-white text-xs leading-relaxed px-3 py-2 shadow-lg z-10">
          {tip}
        </span>
      )}
    </span>
  );
}

interface EventModalProps {
  event: CalendarEvent;
  onClose: () => void;
  onDateSaved: (eventId: string, newDate: Date) => void;
  paceTable: PaceTable;
  /** Only relevant for completed events — shows a spinner while stream data loads. */
  isLoadingStreamData?: boolean;
  apiKey: string;
}

export function EventModal({
  event: selectedEvent,
  onClose,
  onDateSaved,
  paceTable,
  isLoadingStreamData,
  apiKey,
}: EventModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsEditing(false);
    setEditDate("");
  }, [selectedEvent.id]);

  const saveEventEdit = async () => {
    if (!editDate) return;
    const numericId = parseInt(selectedEvent.id.replace("event-", ""), 10);
    if (isNaN(numericId)) return;

    setIsSaving(true);
    try {
      const newDateLocal = editDate.includes("T")
        ? editDate + ":00"
        : editDate + "T12:00:00";
      await updateEvent(apiKey, numericId, { start_date_local: newDateLocal });

      const newDate = new Date(newDateLocal);
      onDateSaved(selectedEvent.id, newDate);
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update event:", err);
      alert("Failed to update event. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-4 sm:p-6 max-w-3xl w-full shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            {isEditing ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <div className="text-sm text-slate-600 mb-1">
                {format(selectedEvent.date, "EEEE d MMMM yyyy 'at' HH:mm", {
                  locale: enGB,
                })}
              </div>
            )}
            <h3 className="text-lg sm:text-xl font-bold">
              {selectedEvent.name}
            </h3>
            {(() => {
              const now = new Date();
              now.setHours(0, 0, 0, 0);
              const isMissed =
                selectedEvent.type === "planned" && selectedEvent.date < now;
              return (
                <div
                  className={`inline-block px-2 py-1 rounded text-xs font-medium mt-2 ${isMissed ? "bg-red-100 text-red-700" : getEventStyle(selectedEvent)}`}
                >
                  {isMissed
                    ? "Missed"
                    : selectedEvent.type === "completed"
                      ? "✓ Completed"
                      : selectedEvent.type === "race"
                        ? "🏁 Race"
                        : "📅 Planned"}
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            {selectedEvent.type === "planned" && !isEditing && (
              <button
                onClick={() => {
                  setEditDate(format(selectedEvent.date, "yyyy-MM-dd'T'HH:mm"));
                  setIsEditing(true);
                }}
                className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
              >
                Edit
              </button>
            )}
            {isEditing && (
              <>
                <button
                  onClick={saveEventEdit}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditDate("");
                  }}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl"
            >
              ✕
            </button>
          </div>
        </div>

        {selectedEvent.description && (
          <WorkoutCard description={selectedEvent.description} paceTable={paceTable} />
        )}

        {selectedEvent.type === "completed" && (
          <div className="space-y-4">
            {/* Stats card */}
            <div className="rounded-xl border border-slate-200 shadow-sm">
              {/* Primary stats — top strip */}
              <div className="bg-slate-50 rounded-t-xl px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {selectedEvent.distance && (
                  <div>
                    <div className="text-slate-500 text-xs">Distance</div>
                    <div className="font-semibold">
                      {(selectedEvent.distance / 1000).toFixed(2)} km
                    </div>
                  </div>
                )}
                {selectedEvent.duration && (
                  <div>
                    <div className="text-slate-500 text-xs">Duration</div>
                    <div className="font-semibold">
                      {Math.floor(selectedEvent.duration / 60)} min
                    </div>
                  </div>
                )}
                {selectedEvent.pace && (
                  <div>
                    <div className="text-slate-500 text-xs">Pace</div>
                    <div className="font-semibold">
                      {Math.floor(selectedEvent.pace)}:
                      {String(
                        Math.round((selectedEvent.pace % 1) * 60),
                      ).padStart(2, "0")}{" "}
                      /km
                    </div>
                  </div>
                )}
                {selectedEvent.avgHr && (
                  <div>
                    <div className="text-slate-500 text-xs">Avg HR</div>
                    <div className="font-semibold">
                      {selectedEvent.avgHr} bpm
                    </div>
                  </div>
                )}
              </div>

              {/* Secondary stats — bottom row */}
              {(selectedEvent.calories ||
                selectedEvent.cadence ||
                selectedEvent.maxHr ||
                selectedEvent.load ||
                selectedEvent.intensity !== undefined) && (
                <div className="px-4 py-2 flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
                  {selectedEvent.calories && (
                    <span>{selectedEvent.calories} kcal</span>
                  )}
                  {selectedEvent.calories && selectedEvent.cadence && (
                    <span>·</span>
                  )}
                  {selectedEvent.cadence && (
                    <span>{Math.round(selectedEvent.cadence)} spm</span>
                  )}
                  {selectedEvent.cadence && selectedEvent.maxHr && (
                    <span>·</span>
                  )}
                  {selectedEvent.maxHr && (
                    <span>Max HR {selectedEvent.maxHr} bpm</span>
                  )}
                  {selectedEvent.maxHr && selectedEvent.load && (
                    <span>·</span>
                  )}
                  {selectedEvent.load && (
                    <StatInfo
                      label={`Load ${Math.round(selectedEvent.load)}`}
                      tip="Training load estimates how hard an activity was relative to your capabilities. It is calculated from heart rate and pace. 1 hour at threshold is roughly 100 load."
                    />
                  )}
                  {selectedEvent.load &&
                    selectedEvent.intensity !== undefined && <span>·</span>}
                  {selectedEvent.intensity !== undefined && (
                    <StatInfo
                      label={`Intensity ${Math.round(selectedEvent.intensity)}%`}
                      tip="Intensity measures how hard the activity was compared to your threshold. Over 100% for an hour or longer suggests your threshold setting is too low."
                    />
                  )}
                </div>
              )}
            </div>

            {/* HR Zones card */}
            {selectedEvent.hrZones && (
              <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
                <div className="text-sm font-semibold text-slate-700 mb-3">
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
            )}

            {/* Stream Graph card */}
            {selectedEvent.streamData &&
            Object.keys(selectedEvent.streamData).length > 0 ? (
              <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
                <WorkoutStreamGraph streamData={selectedEvent.streamData} />
              </div>
            ) : isLoadingStreamData ? (
              <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
                <div className="flex items-center justify-center py-8 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm">Loading workout data...</span>
                </div>
              </div>
            ) : selectedEvent.type === "completed" ? (
              <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
                <div className="text-sm text-slate-500 italic">
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
