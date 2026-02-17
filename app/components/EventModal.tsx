import { useState, useEffect } from "react";
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import type { CalendarEvent, PaceTable } from "@/lib/types";
import { updateEvent } from "@/lib/intervalsApi";
import { getEventStyle } from "@/lib/eventStyles";
import { HRZoneBreakdown } from "./HRZoneBreakdown";
import { WorkoutStreamGraph } from "./WorkoutStreamGraph";
import { PreRunCard } from "./PreRunCard";

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
          <PreRunCard description={selectedEvent.description} paceTable={paceTable} />
        )}

        {selectedEvent.type === "completed" && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 text-sm mb-4">
              {selectedEvent.distance && (
                <div>
                  <div className="text-slate-600">Distance</div>
                  <div className="font-semibold">
                    {(selectedEvent.distance / 1000).toFixed(2)} km
                  </div>
                </div>
              )}
              {selectedEvent.duration && (
                <div>
                  <div className="text-slate-600">Duration</div>
                  <div className="font-semibold">
                    {Math.floor(selectedEvent.duration / 60)} min
                  </div>
                </div>
              )}
              {selectedEvent.pace && (
                <div>
                  <div className="text-slate-600">Pace</div>
                  <div className="font-semibold">
                    {Math.floor(selectedEvent.pace)}:
                    {String(
                      Math.round((selectedEvent.pace % 1) * 60),
                    ).padStart(2, "0")}
                    /km
                  </div>
                </div>
              )}
              {selectedEvent.calories && (
                <div>
                  <div className="text-slate-600">Calories</div>
                  <div className="font-semibold">
                    {selectedEvent.calories} kcal
                  </div>
                </div>
              )}
              {selectedEvent.cadence && (
                <div>
                  <div className="text-slate-600">Cadence</div>
                  <div className="font-semibold">
                    {Math.round(selectedEvent.cadence)} spm
                  </div>
                </div>
              )}
              {selectedEvent.avgHr && (
                <div>
                  <div className="text-slate-600">Avg HR</div>
                  <div className="font-semibold">
                    {selectedEvent.avgHr} bpm
                  </div>
                </div>
              )}
              {selectedEvent.maxHr && (
                <div>
                  <div className="text-slate-600">Max HR</div>
                  <div className="font-semibold">
                    {selectedEvent.maxHr} bpm
                  </div>
                </div>
              )}
              {selectedEvent.load && (
                <div>
                  <div className="text-slate-600">Load</div>
                  <div className="font-semibold">
                    {Math.round(selectedEvent.load)}
                  </div>
                </div>
              )}
              {selectedEvent.intensity !== undefined && (
                <div>
                  <div className="text-slate-600">Intensity</div>
                  <div className="font-semibold">
                    {Math.round(selectedEvent.intensity)}%
                  </div>
                </div>
              )}
            </div>

            {selectedEvent.hrZones && (
              <div className="mb-4">
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

            {selectedEvent.streamData &&
            Object.keys(selectedEvent.streamData).length > 0 ? (
              <div className="mb-4">
                <WorkoutStreamGraph streamData={selectedEvent.streamData} />
              </div>
            ) : isLoadingStreamData ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading workout data...</span>
              </div>
            ) : selectedEvent.type === "completed" ? (
              <div className="text-sm text-slate-500 italic mt-4">
                💡 Detailed workout data (graphs) not available for this
                activity
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
