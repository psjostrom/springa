"use client";

import { useState, useEffect } from "react";
import { Pencil } from "lucide-react";
import { updateActivityPreRunCarbs } from "@/lib/intervalsApi";
import type { WidgetProps } from "@/lib/modalWidgets";

type EditState =
  | { kind: "idle" }
  | { kind: "editing"; g: string; min: string }
  | { kind: "saving"; g: string; min: string };

/** Pre-run carbs widget with two-field inline edit (grams + minutes before). */
export function PreRunCarbsWidget({ event, apiKey }: WidgetProps) {
  const [editState, setEditState] = useState<EditState>({ kind: "idle" });
  const [savedPreRun, setSavedPreRun] = useState<{ g: number | null; min: number | null } | null>(null);
  const [dbPreRun, setDbPreRun] = useState<{ eventId: string; g: number | null; min: number | null } | null>(null);

  const dbPreRunForThisEvent = dbPreRun?.eventId === event.id ? dbPreRun : null;

  // Fetch pre-run carbs from Turso when the activity has a paired event but no data from Intervals.icu
  useEffect(() => {
    if (event.type !== "completed" || !event.pairedEventId) return;
    if (event.preRunCarbsG != null || event.preRunCarbsMin != null) return;

    let cancelled = false;
    fetch(`/api/prerun-carbs?eventId=${encodeURIComponent(String(event.pairedEventId))}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: { carbsG: number | null; minutesBefore: number | null } | null) => {
        if (cancelled || !data) return;
        setDbPreRun({ eventId: event.id, g: data.carbsG, min: data.minutesBefore });
      })
      .catch(() => {/* ignore */});
    return () => { cancelled = true; };
  }, [event.id, event.type, event.pairedEventId, event.preRunCarbsG, event.preRunCarbsMin]);

  const displayG = savedPreRun?.g ?? event.preRunCarbsG ?? dbPreRunForThisEvent?.g ?? null;
  const displayMin = savedPreRun?.min ?? event.preRunCarbsMin ?? dbPreRunForThisEvent?.min ?? null;

  const savePreRunCarbs = async () => {
    if (editState.kind !== "editing") return;
    const actId = event.activityId;
    if (!actId) return;

    const g = editState.g ? parseInt(editState.g, 10) : null;
    const min = editState.min ? parseInt(editState.min, 10) : null;

    setEditState({ kind: "saving", g: editState.g, min: editState.min });
    try {
      await updateActivityPreRunCarbs(apiKey, actId, g, min);
      // Clean up Turso fallback row if this activity has a paired event
      if (event.pairedEventId) {
        void fetch(`/api/prerun-carbs?eventId=${encodeURIComponent(String(event.pairedEventId))}`, {
          method: "DELETE",
        });
      }
      setSavedPreRun({ g, min });
      setEditState({ kind: "idle" });
    } catch (err) {
      console.error("Failed to update pre-run carbs:", err);
      setEditState({ kind: "idle" });
    }
  };

  if (!event.activityId) return null;

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[#b8a5d4]">Pre-run carbs</div>
        {editState.kind === "editing" || editState.kind === "saving" ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={editState.g}
              onChange={(e) => {
                if (editState.kind === "editing") setEditState({ ...editState, g: e.target.value });
              }}
              placeholder="g"
              className="w-14 border border-[#3d2b5a] bg-[#1a1030] text-white rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void savePreRunCarbs();
                if (e.key === "Escape") setEditState({ kind: "idle" });
              }}
            />
            <span className="text-sm text-[#b8a5d4]">g</span>
            <input
              type="number"
              min="0"
              value={editState.min}
              onChange={(e) => {
                if (editState.kind === "editing") setEditState({ ...editState, min: e.target.value });
              }}
              placeholder="min"
              className="w-14 border border-[#3d2b5a] bg-[#1a1030] text-white rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
              onKeyDown={(e) => {
                if (e.key === "Enter") void savePreRunCarbs();
                if (e.key === "Escape") setEditState({ kind: "idle" });
              }}
            />
            <span className="text-sm text-[#b8a5d4]">min before</span>
            <button
              onClick={() => { void savePreRunCarbs(); }}
              disabled={editState.kind === "saving"}
              className="px-2 py-1 text-xs bg-[#ff2d95] hover:bg-[#e0207a] text-white rounded transition disabled:opacity-50"
            >
              {editState.kind === "saving" ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setEditState({ kind: "idle" }); }}
              disabled={editState.kind === "saving"}
              className="px-2 py-1 text-xs bg-[#2a1f3d] hover:bg-[#3d2b5a] text-[#c4b5fd] rounded transition"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setEditState({
                kind: "editing",
                g: displayG ? String(displayG) : "",
                min: displayMin ? String(displayMin) : "",
              });
            }}
            className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-[#ff2d95] transition"
          >
            {(() => {
              if (displayG && displayMin) return `${displayG}g, ${displayMin} min before`;
              if (displayG) return `${displayG}g`;
              return "—";
            })()}
            <Pencil className="w-3 h-3 text-[#b8a5d4]" />
          </button>
        )}
      </div>
    </div>
  );
}
