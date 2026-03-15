"use client";

import { useState, useEffect } from "react";
import { useSetAtom } from "jotai";
import { Pencil } from "lucide-react";
import { updateActivityPreRunCarbs } from "@/lib/intervalsApi";
import { patchCalendarEventAtom } from "../atoms";
import type { WidgetProps } from "@/lib/modalWidgets";

type EditState =
  | { kind: "idle" }
  | { kind: "editing"; g: string; error?: string }
  | { kind: "saving"; g: string };

/** Pre-run carbs widget with inline edit. */
export function PreRunCarbsWidget({ event, apiKey }: WidgetProps) {
  const [editState, setEditState] = useState<EditState>({ kind: "idle" });
  const [dbPreRun, setDbPreRun] = useState<{ eventId: string; g: number | null } | null>(null);
  const patchEvent = useSetAtom(patchCalendarEventAtom);

  const dbPreRunForThisEvent = dbPreRun?.eventId === event.id ? dbPreRun : null;

  // Fetch pre-run carbs from Turso when the activity has a paired event but no data from Intervals.icu
  useEffect(() => {
    if (event.type !== "completed" || !event.pairedEventId) return;
    if (event.preRunCarbsG != null) return;

    let cancelled = false;
    fetch(`/api/prerun-carbs?eventId=${encodeURIComponent(String(event.pairedEventId))}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: { carbsG: number | null } | null) => {
        if (cancelled || !data) return;
        setDbPreRun({ eventId: event.id, g: data.carbsG });
      })
      .catch((err: unknown) => { console.error("Failed to fetch pre-run carbs:", err); });
    return () => { cancelled = true; };
  }, [event.id, event.type, event.pairedEventId, event.preRunCarbsG]);

  const displayG = event.preRunCarbsG ?? dbPreRunForThisEvent?.g ?? null;

  const savePreRunCarbs = async () => {
    if (editState.kind !== "editing") return;
    const actId = event.activityId;
    if (!actId) return;

    const g = editState.g ? parseInt(editState.g, 10) : null;

    setEditState({ kind: "saving", g: editState.g });
    try {
      await updateActivityPreRunCarbs(apiKey, actId, g);
      // Clean up Turso fallback row if this activity has a paired event
      if (event.pairedEventId) {
        void fetch(`/api/prerun-carbs?eventId=${encodeURIComponent(String(event.pairedEventId))}`, {
          method: "DELETE",
        }).catch((err: unknown) => { console.error("Failed to delete Turso pre-run row:", err); });
      }
      patchEvent({ id: event.id, patch: { preRunCarbsG: g } });
      setEditState({ kind: "idle" });
    } catch (err) {
      console.error("Failed to update pre-run carbs:", err);
      setEditState({ kind: "editing", g: editState.g, error: "Save failed" });
    }
  };

  if (!event.activityId) return null;

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[#af9ece]">Pre-run carbs</div>
        {editState.kind === "editing" || editState.kind === "saving" ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min="0"
              value={editState.g}
              onChange={(e) => {
                if (editState.kind === "editing") setEditState({ ...editState, g: e.target.value });
              }}
              placeholder="g"
              className="w-16 border border-[#2e293c] bg-[#1a1030] text-white rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#f23b94]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void savePreRunCarbs();
                if (e.key === "Escape") setEditState({ kind: "idle" });
              }}
            />
            <span className="text-sm text-[#af9ece]">g</span>
            <button
              onClick={() => { void savePreRunCarbs(); }}
              disabled={editState.kind === "saving"}
              className="px-2 py-1 text-xs bg-[#f23b94] hover:bg-[#d42f7e] text-white rounded transition disabled:opacity-50"
            >
              {editState.kind === "saving" ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setEditState({ kind: "idle" }); }}
              disabled={editState.kind === "saving"}
              className="px-2 py-1 text-xs bg-[#2e293c] hover:bg-[#2e293c] text-[#af9ece] rounded transition"
            >
              ✕
            </button>
            {editState.kind === "editing" && editState.error && (
              <span className="text-xs text-red-400 w-full">{editState.error}</span>
            )}
          </div>
        ) : (
          <button
            onClick={() => {
              setEditState({
                kind: "editing",
                g: displayG ? String(displayG) : "",
              });
            }}
            className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-[#f23b94] transition"
          >
            {displayG ? `${displayG}g` : "—"}
            <Pencil className="w-3 h-3 text-[#af9ece]" />
          </button>
        )}
      </div>
    </div>
  );
}
