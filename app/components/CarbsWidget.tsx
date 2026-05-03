"use client";

import { useState } from "react";
import { useSetAtom } from "jotai";
import { Pencil } from "lucide-react";
import { updateActivityCarbs } from "@/lib/intervalsClient";
import { patchCalendarEventAtom } from "../atoms";
import {
  createWorkoutEstimationContext,
  resolveWorkoutMetrics,
} from "@/lib/workoutMath";
import type { WidgetProps } from "@/lib/modalWidgets";

type EditState =
  | { kind: "idle" }
  | { kind: "editing"; value: string; error?: string }
  | { kind: "saving"; value: string };

/** Carbs ingested widget with inline edit. */
export function CarbsWidget({ event, paceTable, racePacePerKm }: WidgetProps) {
  const [editState, setEditState] = useState<EditState>({ kind: "idle" });
  const patchEvent = useSetAtom(patchCalendarEventAtom);
  const workoutContext = createWorkoutEstimationContext({
    paceTable,
    thresholdPace: racePacePerKm,
  });

  // Fall back to the prescribed total — derived here, not stored — when the user
  // hasn't entered an actual value. Pace context is required for absolute-pace
  // descriptions (without it the wide easy zone gives a 2x-too-high number).
  const planned = resolveWorkoutMetrics(
    event.description,
    event.fuelRate,
    workoutContext,
  ).prescribedCarbsG;
  const prescribedCarbsG = event.prescribedCarbsG ?? planned;
  const displayCarbs = event.carbsIngested ?? prescribedCarbsG ?? null;

  const saveCarbs = async () => {
    if (editState.kind !== "editing") return;
    const val = parseInt(editState.value, 10);
    if (isNaN(val) || val < 0) return;
    const actId = event.activityId;
    if (!actId) return;

    setEditState({ kind: "saving", value: editState.value });
    try {
      await updateActivityCarbs(actId, val);
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
        <div className="text-sm text-muted">Carbs ingested</div>
        {editState.kind === "editing" || editState.kind === "saving" ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min="0"
              value={editState.value}
              onChange={(e) => { setEditState({ kind: "editing", value: e.target.value }); }}
              className="w-16 border border-border bg-surface-alt text-text rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveCarbs();
                if (e.key === "Escape") setEditState({ kind: "idle" });
              }}
            />
            <span className="text-sm text-muted">g</span>
            <button
              onClick={() => { void saveCarbs(); }}
              disabled={editState.kind === "saving"}
              className="px-2 py-1 text-xs bg-brand hover:bg-brand-hover text-white rounded transition disabled:opacity-50"
            >
              {editState.kind === "saving" ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setEditState({ kind: "idle" }); }}
              disabled={editState.kind === "saving"}
              className="px-2 py-1 text-xs bg-border hover:bg-border text-muted rounded transition"
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
            className="flex items-center gap-1.5 text-sm font-semibold text-text hover:text-brand transition"
          >
            {displayCarbs ?? "—"}g
            {event.carbsIngested == null && (
              <span className="text-xs font-normal text-muted">(planned)</span>
            )}
            <Pencil className="w-3 h-3 text-muted" />
          </button>
        )}
      </div>
    </div>
  );
}
