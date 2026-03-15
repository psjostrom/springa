"use client";

import { useState } from "react";
import { useSetAtom } from "jotai";
import { Pencil } from "lucide-react";
import { updateActivityCarbs } from "@/lib/intervalsApi";
import { patchCalendarEventAtom } from "../atoms";
import type { WidgetProps } from "@/lib/modalWidgets";

type EditState =
  | { kind: "idle" }
  | { kind: "editing"; value: string; error?: string }
  | { kind: "saving"; value: string };

/** Carbs ingested widget with inline edit. */
export function CarbsWidget({ event, apiKey }: WidgetProps) {
  const [editState, setEditState] = useState<EditState>({ kind: "idle" });
  const patchEvent = useSetAtom(patchCalendarEventAtom);

  const displayCarbs = event.carbsIngested ?? event.totalCarbs ?? null;

  const saveCarbs = async () => {
    if (editState.kind !== "editing") return;
    const val = parseInt(editState.value, 10);
    if (isNaN(val) || val < 0) return;
    const actId = event.activityId;
    if (!actId) return;

    setEditState({ kind: "saving", value: editState.value });
    try {
      await updateActivityCarbs(apiKey, actId, val);
      patchEvent({ id: event.id, patch: { carbsIngested: val } });
      setEditState({ kind: "idle" });
    } catch (err) {
      console.error("Failed to update carbs:", err);
      setEditState({ kind: "editing", value: editState.value, error: "Save failed" });
    }
  };

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[#af9ece]">Carbs ingested</div>
        {editState.kind === "editing" || editState.kind === "saving" ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min="0"
              value={editState.value}
              onChange={(e) => { setEditState({ kind: "editing", value: e.target.value }); }}
              className="w-16 border border-[#2e293c] bg-[#1a1030] text-white rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#f23b94]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveCarbs();
                if (e.key === "Escape") setEditState({ kind: "idle" });
              }}
            />
            <span className="text-sm text-[#af9ece]">g</span>
            <button
              onClick={() => { void saveCarbs(); }}
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
              setEditState({ kind: "editing", value: String(displayCarbs ?? 0) });
            }}
            className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-[#f23b94] transition"
          >
            {displayCarbs ?? "—"}g
            {event.carbsIngested == null && (
              <span className="text-xs font-normal text-[#af9ece]">(planned)</span>
            )}
            <Pencil className="w-3 h-3 text-[#af9ece]" />
          </button>
        )}
      </div>
    </div>
  );
}
