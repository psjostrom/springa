"use client";

import { useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Loader2 } from "lucide-react";
import { settingsAtom, bgModelAtom, paceTableAtom, calendarReloadAtom } from "../atoms";
import { getThresholdPace } from "@/lib/paceTable";
import { generateSingleWorkout, suggestCategory, buildContext, getWeekPhase, type OnDemandCategory, type PlanConfig } from "@/lib/workoutGenerators";
import { replaceWorkout } from "@/lib/intervalsClient";
import { getWeekIdx } from "@/lib/workoutMath";
import type { WorkoutEvent } from "@/lib/types";
import { WorkoutCard } from "./WorkoutCard";
import { WorkoutStructureBar } from "./WorkoutStructureBar";

interface WorkoutGeneratorProps {
  date: Date;
  existingEventId?: number;
  existingEventName?: string;
  onGenerated: () => void;
  onCancel: () => void;
}

type GeneratorState =
  | { step: "picking"; error?: string }
  | { step: "previewing"; workout: WorkoutEvent; category: OnDemandCategory }
  | { step: "syncing"; workout: WorkoutEvent; category: OnDemandCategory }
  | { step: "error"; message: string; workout: WorkoutEvent; category: OnDemandCategory };

const CATEGORY_OPTIONS: { value: OnDemandCategory; label: string; icon: string }[] = [
  { value: "easy", label: "Easy", icon: "🏃" },
  { value: "quality", label: "Quality", icon: "⚡" },
  { value: "long", label: "Long", icon: "🛤️" },
  { value: "club", label: "Club Run", icon: "👥" },
];

export function WorkoutGenerator({
  date,
  existingEventId,
  existingEventName,
  onGenerated,
  onCancel,
}: WorkoutGeneratorProps) {
  const [state, setState] = useState<GeneratorState>({ step: "picking" });

  const settings = useAtomValue(settingsAtom);
  const bgModel = useAtomValue(bgModelAtom);
  const paceTable = useAtomValue(paceTableAtom);
  const reloadCalendar = useSetAtom(calendarReloadAtom);

  if (!settings?.raceDate || !settings.totalWeeks || !settings.lthr || !settings.hrZones?.length) {
    return (
      <div className="text-sm text-muted py-4">
        Plan settings required (race date, LTHR, HR zones).
      </div>
    );
  }

  const planConfig: PlanConfig = {
    bgModel,
    raceDateStr: settings.raceDate,
    raceDist: settings.raceDist ?? 16,
    totalWeeks: settings.totalWeeks,
    startKm: settings.startKm ?? 8,
    lthr: settings.lthr,
    hrZones: settings.hrZones,
    includeBasePhase: settings.includeBasePhase,
  };

  // Compute suggested category from plan phase
  const ctx = buildContext(planConfig);
  const weekIdx = getWeekIdx(date, ctx.planStartMonday);
  const suggested = weekIdx >= 0 && weekIdx < planConfig.totalWeeks
    ? suggestCategory(date, getWeekPhase(ctx, weekIdx))
    : "easy";

  const handlePickCategory = (category: OnDemandCategory) => {
    const workout = generateSingleWorkout(category, date, planConfig);
    if (!workout) {
      setState({ step: "picking", error: "Date is outside the training plan." });
      return;
    }
    setState({ step: "previewing", workout, category });
  };

  const handleSync = async (workout: WorkoutEvent, category: OnDemandCategory) => {
    setState({ step: "syncing", workout, category });
    try {
      await replaceWorkout(existingEventId, workout);
      reloadCalendar();
      onGenerated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      setState((prev) =>
        prev.step === "syncing"
          ? { step: "error", message, workout, category: prev.category }
          : prev,
      );
    }
  };

  if (state.step === "picking") {
    return (
      <div className="space-y-3">
        {existingEventName && (
          <div className="text-sm text-muted">
            Replacing <span className="font-medium text-text">{existingEventName}</span>
          </div>
        )}
        {state.error && (
          <div className="px-3 py-2 rounded-lg bg-tint-error text-text text-sm">
            {state.error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { handlePickCategory(opt.value); }}
              className={`relative p-3 rounded-lg border text-left transition hover:bg-border ${
                opt.value === suggested
                  ? "border-brand bg-tint-brand"
                  : "border-border bg-surface-alt"
              }`}
            >
              <div className="text-lg mb-0.5">{opt.icon}</div>
              <div className="font-medium text-text text-sm">{opt.label}</div>
              {opt.value === suggested && (
                <div className="absolute top-1.5 right-1.5 text-[10px] font-semibold text-brand uppercase tracking-wider">
                  Suggested
                </div>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full py-2 text-sm text-muted hover:text-text transition"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (state.step === "syncing") {
    return (
      <div className="flex items-center justify-center gap-2 py-8">
        <Loader2 className="animate-spin text-brand" size={20} />
        <span className="text-sm text-muted">Syncing to Intervals...</span>
      </div>
    );
  }

  // previewing or error
  const workout = state.workout;

  return (
    <div className="space-y-3">
      <WorkoutCard
        description={workout.description}
        fuelRate={workout.fuelRate}
        paceTable={paceTable}
        hrZones={settings.hrZones}
        lthr={settings.lthr}
        racePacePerKm={getThresholdPace(settings.currentAbilityDist, settings.currentAbilitySecs)}
      >
        <WorkoutStructureBar
          description={workout.description}
          maxHeight={48}
          hrZones={settings.hrZones}
          lthr={settings.lthr}
        />
      </WorkoutCard>

      {state.step === "error" && (
        <div className="px-3 py-2 rounded-lg bg-tint-error text-text text-sm">
          {state.message}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => { void handleSync(workout, state.category); }}
          className="flex-1 py-2.5 text-sm font-medium bg-brand hover:bg-brand-hover text-white rounded-lg transition"
        >
          Sync Workouts
        </button>
        <button
          onClick={() => { setState({ step: "picking" }); }}
          className="px-4 py-2.5 text-sm bg-surface-alt hover:bg-border text-muted rounded-lg transition"
        >
          Back
        </button>
      </div>
    </div>
  );
}
