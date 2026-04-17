"use client";

import { useState } from "react";
import { useAtomValue } from "jotai";
import type { UserSettings } from "@/lib/settings";
import { getPaceTable, getSliderRange, getDefaultGoalTime, DISTANCE_OPTIONS } from "@/lib/paceTable";
import { formatGoalTime } from "@/lib/format";
import { PacePreview } from "@/app/components/PacePreview";
import { PaceSuggestionCard } from "@/app/components/PaceSuggestionCard";
import { computeMaxHRZones, ZONE_COLORS, ZONE_DISPLAY_NAMES } from "@/lib/constants";
import { paceSuggestionAtom } from "@/app/atoms";

interface TrainingTabProps {
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
  onAbilityChanged?: (newSecs: number, newDist: number) => Promise<void>;
}

export function TrainingTab({ settings, onSave, onAbilityChanged }: TrainingTabProps) {
  const [abilityDist, setAbilityDist] = useState(settings.currentAbilityDist ?? 0);
  const [abilitySecs, setAbilitySecs] = useState(settings.currentAbilitySecs ?? 0);
  const [goalDist, setGoalDist] = useState(settings.raceDist ?? 0);
  const [raceDate, setRaceDate] = useState(settings.raceDate ?? "");
  const [maxHr, setMaxHr] = useState(settings.maxHr ?? 0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [editingRaceGoal, setEditingRaceGoal] = useState(false);
  const paceSuggestion = useAtomValue(paceSuggestionAtom);
  const [isAcceptingPace, setIsAcceptingPace] = useState(false);
  const [paceAcceptError, setPaceAcceptError] = useState<string | null>(null);

  const handleAcceptPace = async () => {
    if (!paceSuggestion) return;
    setIsAcceptingPace(true);
    setPaceAcceptError(null);
    try {
      const newSecs = paceSuggestion.suggestedAbilitySecs;
      const newDist = paceSuggestion.currentAbilityDist;
      setAbilitySecs(newSecs);
      await onSave({ currentAbilitySecs: newSecs, paceSuggestionDismissedAt: Date.now() });
      if (onAbilityChanged) {
        await onAbilityChanged(newSecs, newDist);
      }
    } catch (e) {
      setPaceAcceptError(e instanceof Error ? e.message : "Failed to update paces");
    }
    setIsAcceptingPace(false);
  };

  const handleDismissPace = async () => {
    await onSave({ paceSuggestionDismissedAt: Date.now() });
  };

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
      if (maxHr !== (settings.maxHr ?? 0)) {
        updates.maxHr = maxHr || undefined;
      }

      if (Object.keys(updates).length > 0) {
        await onSave(updates);
      }

      // Sync ability change: push threshold + regenerate plan + upload + calendar sync
      const abilityChanged = abilitySecs !== (settings.currentAbilitySecs ?? 0) || abilityDist !== (settings.currentAbilityDist ?? 0);
      if (abilityChanged && abilityDist > 0 && abilitySecs > 0) {
        if (onAbilityChanged) {
          setStatus("Updating plan...");
          await onAbilityChanged(abilitySecs, abilityDist);
        } else if (settings.intervalsConnected) {
          // Fallback: just push threshold (no plan regen)
          const table = getPaceTable(abilityDist, abilitySecs);
          fetch("/api/intervals/threshold-pace", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paceMinPerKm: table.hmEquivalentPacePerKm }),
          }).catch((e: unknown) => { console.error("Threshold pace sync failed:", e); });
        }
      }
      if (settings.intervalsConnected && maxHr !== (settings.maxHr ?? 0) && maxHr > 0 && settings.sportSettingsId) {
        const zones = computeMaxHRZones(maxHr);
        fetch("/api/intervals/hr-zones", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sportSettingsId: settings.sportSettingsId, hrZones: zones, maxHr }),
        }).catch((e: unknown) => { console.error("HR zone sync failed:", e); });
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

      {/* Pace suggestion */}
      {paceSuggestion && (
        <div className="space-y-2">
          <PaceSuggestionCard
            suggestion={paceSuggestion}
            onAccept={() => { void handleAcceptPace(); }}
            onDismiss={() => { void handleDismissPace(); }}
            isAccepting={isAcceptingPace}
          />
          {paceAcceptError && (
            <p className="text-xs text-red-400">{paceAcceptError}</p>
          )}
        </div>
      )}

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

      {/* HR Zones */}
      <div>
        <p className="text-xs text-muted mb-2">HR Zones</p>
        <div className="flex items-center gap-3 mb-3">
          <label className="text-xs text-muted">Max HR</label>
          <input
            type="number"
            min={120}
            max={230}
            value={maxHr || ""}
            onChange={(e) => { setMaxHr(e.target.value === "" ? 0 : Number(e.target.value)); }}
            className="w-20 px-3 py-2 border border-border rounded-lg text-text bg-surface-alt text-sm text-center"
          />
          <span className="text-xs text-muted">bpm</span>
        </div>
        {maxHr > 0 && (() => {
          const zones = computeMaxHRZones(maxHr);
          return (
            <div className="bg-surface-alt border border-border rounded-lg p-3 space-y-1 text-sm">
              {(["z1", "z2", "z3", "z4", "z5"] as const).map((zone, i) => {
                const lo = i === 0 ? 0 : zones[i - 1];
                const hi = zones[i];
                return (
                  <div key={zone} className="flex justify-between">
                    <span style={{ color: ZONE_COLORS[zone] }}>{ZONE_DISPLAY_NAMES[zone]}</span>
                    <span className="text-muted">
                      {i === 0 ? `< ${hi}` : i === 4 ? `${lo}+` : `${lo} \u2013 ${hi}`} bpm
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Save button */}
      <div className="mt-6">
        <button
          onClick={() => { void handleSave(); }}
          disabled={saving}
          className="w-full py-2.5 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50"
        >
          {status === "Updating plan..." ? "Updating plan..." : saving ? "Saving..."
            : (abilitySecs !== (settings.currentAbilitySecs ?? 0) || abilityDist !== (settings.currentAbilityDist ?? 0))
              ? "Save & update plan" : "Save"}
        </button>
        {status && status !== "Updating plan..." && (
          <p className={`text-sm mt-2 ${status.startsWith("Saved") ? "text-success" : "text-error"}`}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
