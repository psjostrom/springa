"use client";

import { useState } from "react";
import type { UserSettings } from "@/lib/settings";
import { getPaceTable, getSliderRange, getDefaultGoalTime, DISTANCE_OPTIONS } from "@/lib/paceTable";
import { formatGoalTime } from "@/lib/format";
import { PacePreview } from "@/app/components/PacePreview";

interface TrainingTabProps {
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
}

export function TrainingTab({ settings, onSave }: TrainingTabProps) {
  const [abilityDist, setAbilityDist] = useState(settings.currentAbilityDist ?? 0);
  const [abilitySecs, setAbilitySecs] = useState(settings.currentAbilitySecs ?? 0);
  const [goalDist, setGoalDist] = useState(settings.raceDist ?? 0);
  const [raceDate, setRaceDate] = useState(settings.raceDate ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [editingRaceGoal, setEditingRaceGoal] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setStatus("");

    try {
      const updates: Partial<UserSettings> = {};

      if (abilitySecs !== (settings.currentAbilitySecs ?? 0)) {
        updates.currentAbilitySecs = abilitySecs || undefined;
      }
      if (abilityDist !== (settings.currentAbilityDist ?? 0)) {
        updates.currentAbilityDist = abilityDist || undefined;
      }
      if (goalDist !== (settings.raceDist ?? 0)) {
        updates.raceDist = goalDist || undefined;
      }
      if (raceDate !== (settings.raceDate ?? "")) {
        updates.raceDate = raceDate || undefined;
      }

      if (Object.keys(updates).length > 0) {
        await onSave(updates);
      }

      // Fire-and-forget sync to Intervals.icu if ability changed
      const abilityChanged = abilitySecs !== (settings.currentAbilitySecs ?? 0) || abilityDist !== (settings.currentAbilityDist ?? 0);
      if (settings.intervalsConnected && abilityChanged && abilityDist > 0 && abilitySecs > 0) {
        const table = getPaceTable(abilityDist, abilitySecs);
        fetch("/api/intervals/threshold-pace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paceMinPerKm: table.hmEquivalentPacePerKm }),
        }).catch((e: unknown) => { console.error("Threshold pace sync failed:", e); });
      }

      setStatus("Saved");
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const hasGoal = goalDist > 0 && raceDate;
  const weeks = hasGoal ? Math.floor((new Date(raceDate).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)) : 0;

  // Compute fitness section values
  const sliderRange = abilityDist > 0 ? getSliderRange(abilityDist) : null;
  const distLabel = abilityDist > 0 ? (DISTANCE_OPTIONS.find(d => d.km === abilityDist)?.label ?? `${abilityDist}km`) : "";

  return (
    <div className="space-y-6">
      {/* Current fitness */}
      <div>
        <p className="text-xs text-muted mb-2">Your fitness</p>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {DISTANCE_OPTIONS.map(({ label, km }) => (
            <button
              key={km}
              type="button"
              onClick={() => {
                setAbilityDist(km);
                setAbilitySecs(getDefaultGoalTime(km, "intermediate"));
              }}
              className={`py-1.5 rounded-lg border text-xs font-semibold transition ${
                abilityDist === km
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {sliderRange && (
          <>
            <p className="text-xs text-muted text-center mb-1">
              Current {distLabel} time
            </p>
            <p className="text-2xl font-bold text-text text-center mb-2">
              {formatGoalTime(abilitySecs)}
            </p>
            <input
              type="range"
              min={sliderRange.min}
              max={sliderRange.max}
              step={sliderRange.step}
              value={abilitySecs}
              onChange={(e) => { setAbilitySecs(Number(e.target.value)); }}
              className="w-full accent-brand"
            />
          </>
        )}
      </div>

      {/* Race goal */}
      <div>
        <p className="text-xs text-muted mb-2">Race goal</p>
        {hasGoal && !editingRaceGoal ? (
          <div className="border-2 border-warning/50 bg-warning/5 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-text mb-1">
                  {DISTANCE_OPTIONS.find(d => d.km === goalDist)?.label ?? `${goalDist}km`}
                </div>
                <div className="text-xs text-muted">
                  {new Date(raceDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </div>
                {weeks > 0 ? (
                  <div className="text-xs font-medium text-brand mt-1">
                    {weeks} week{weeks !== 1 ? "s" : ""} away
                  </div>
                ) : weeks === 0 ? (
                  <div className="text-xs font-medium text-warning mt-1">This week</div>
                ) : (
                  <div className="text-xs font-medium text-muted mt-1">Past</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setEditingRaceGoal(true); }}
                className="text-xs text-brand hover:text-brand-hover transition"
              >
                Edit
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-1.5">
              {DISTANCE_OPTIONS.map(({ label, km }) => (
                <button
                  key={`goal-${km}`}
                  type="button"
                  onClick={() => { setGoalDist(km); }}
                  className={`py-1.5 rounded-lg border text-xs font-semibold transition ${
                    goalDist === km
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {goalDist > 0 && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted flex-shrink-0">Race date</label>
                <input
                  type="date"
                  value={raceDate}
                  onChange={(e) => { setRaceDate(e.target.value); }}
                  className="flex-1 px-3 py-2 border border-border rounded-lg text-text bg-surface-alt text-sm"
                />
                {raceDate && (
                  weeks > 0 ? (
                    <span className="text-xs font-medium text-brand whitespace-nowrap">{weeks}w</span>
                  ) : weeks === 0 ? (
                    <span className="text-xs font-medium text-warning whitespace-nowrap">This week</span>
                  ) : (
                    <span className="text-xs font-medium text-muted whitespace-nowrap">Past</span>
                  )
                )}
              </div>
            )}

            {hasGoal && (
              <button
                type="button"
                onClick={() => { setEditingRaceGoal(false); }}
                className="text-xs text-muted hover:text-text transition"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pace preview */}
      {abilityDist > 0 && abilitySecs > 0 && (
        <div>
          <PacePreview paceTable={getPaceTable(abilityDist, abilitySecs)} />
        </div>
      )}

      {/* Save button */}
      <div className="mt-6">
        <button
          onClick={() => { void handleSave(); }}
          disabled={saving}
          className="w-full py-2.5 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {status && (
          <p className={`text-sm mt-2 ${status.startsWith("Saved") ? "text-success" : "text-error"}`}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
