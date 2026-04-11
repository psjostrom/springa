"use client";

import { useState } from "react";
import { getPaceTable, getDefaultGoalTime, getSliderRange, type ExperienceLevel } from "@/lib/paceTable";
import { formatPace, formatGoalTime } from "@/lib/format";
import { addWeeks, format, differenceInWeeks, parseISO, isBefore } from "date-fns";

interface AbilityStepProps {
  raceDist: number;
  experience: ExperienceLevel;
  raceDate?: string;
  currentAbilitySecs?: number;
  currentAbilityDist?: number;
  goalTime?: number;
  onNext: (data: {
    currentAbilitySecs: number;
    currentAbilityDist: number;
    goalTime?: number;
    raceDate: string;
  }) => void;
  onBack: () => void;
}

const ABILITY_DISTANCES = [
  { label: "5km", km: 5 },
  { label: "10km", km: 10 },
  { label: "Half Marathon", km: 21.0975 },
  { label: "Marathon", km: 42.195 },
];

function distLabel(km: number): string {
  const match = ABILITY_DISTANCES.find((d) => d.km === km);
  return match ? match.label : `${km}km`;
}

export function AbilityStep({ raceDist, experience, raceDate: initialDate, currentAbilitySecs: initialAbility, currentAbilityDist: initialAbilityDist, goalTime: initialGoalTime, onNext, onBack }: AbilityStepProps) {
  const [abilityDist, setAbilityDist] = useState<number>(initialAbilityDist ?? 5);
  const [abilitySecs, setAbilitySecs] = useState<number>(initialAbility ?? getDefaultGoalTime(initialAbilityDist ?? 5, experience));
  const [goalMode, setGoalMode] = useState<"finish" | "time">(initialGoalTime != null ? "time" : "finish");
  const [goalTimeSecs, setGoalTimeSecs] = useState<number | undefined>(initialGoalTime ?? undefined);
  const [raceDate, setRaceDate] = useState(initialDate ?? format(addWeeks(new Date(), 18), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAbilityDist = (km: number) => {
    setAbilityDist(km);
    setAbilitySecs(getDefaultGoalTime(km, experience));
  };

  const abilitySliderRange = getSliderRange(abilityDist);
  const goalSliderRange = getSliderRange(raceDist);

  const pacePreview = getPaceTable(abilityDist, abilitySecs);

  const minDate = format(addWeeks(new Date(), 12), "yyyy-MM-dd");
  const weeksToGo = differenceInWeeks(parseISO(raceDate), new Date());
  const dateTooSoon = isBefore(parseISO(raceDate), addWeeks(new Date(), 12));

  const canProceed = !dateTooSoon;

  const handleNext = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      raceDist,
      currentAbilitySecs: abilitySecs,
      currentAbilityDist: abilityDist,
      goalTime: goalMode === "time" ? goalTimeSecs : undefined,
      raceDate,
    };
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError("Failed to save. Try again.");
        return;
      }
      onNext(payload);
    } catch {
      setError("Connection error. Check your internet and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Current Fitness</h2>
      <p className="text-muted mb-6">
        Pick the distance you know best. This isn&apos;t a goal — it&apos;s where you are today.
      </p>

      <fieldset disabled={saving} className="space-y-6">
        {/* Ability distance picker */}
        <div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {ABILITY_DISTANCES.map(({ label, km }) => (
              <button
                key={km}
                onClick={() => { handleAbilityDist(km); }}
                className={`py-2.5 rounded-lg border-2 font-semibold text-xs transition ${
                  abilityDist === km
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-sm text-muted text-center mb-2">
            I can currently run a <span className="text-brand font-semibold">{distLabel(abilityDist)}</span> in
          </p>
          <p className="text-4xl font-bold text-text text-center mb-4">
            {formatGoalTime(abilitySecs)}
          </p>
          <input
            type="range"
            min={abilitySliderRange.min}
            max={abilitySliderRange.max}
            step={abilitySliderRange.step}
            value={abilitySecs}
            onChange={(e) => { setAbilitySecs(Number(e.target.value)); }}
            className="w-full accent-brand"
          />

          <div className="bg-surface-alt border border-border rounded-lg p-4 mt-4 space-y-1 text-sm">
            <p className="text-text font-semibold mb-2">Your training paces</p>
            <div className="flex justify-between text-muted">
              <span>Easy</span>
              <span>{formatPace(pacePreview.z2.min)} &ndash; {formatPace(pacePreview.z2.max)} /km</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Race</span>
              <span>{formatPace(pacePreview.z3.min)} &ndash; {formatPace(pacePreview.z3.max)} /km</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Intervals</span>
              <span>{formatPace(pacePreview.z4.min)} &ndash; {formatPace(pacePreview.z4.max)} /km</span>
            </div>
          </div>
        </div>

        {/* Race goal */}
        <div>
          <label className="block text-sm font-semibold text-muted mb-2">
            Do you have a time goal for race day?
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setGoalMode("finish"); setGoalTimeSecs(undefined); }}
              className={`py-3 rounded-lg border-2 font-semibold text-sm transition ${
                goalMode === "finish"
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              Just finish
            </button>
            <button
              onClick={() => { setGoalMode("time"); setGoalTimeSecs(goalTimeSecs ?? getDefaultGoalTime(raceDist, experience)); }}
              className={`py-3 rounded-lg border-2 font-semibold text-sm transition ${
                goalMode === "time"
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              Set a finish time
            </button>
          </div>

          {goalMode === "time" && goalTimeSecs != null && (
            <div className="mt-4">
              <p className="text-xs text-muted mb-2">
                What time are you aiming for?
              </p>
              <p className="text-3xl font-bold text-text text-center mb-3">
                {formatGoalTime(goalTimeSecs)}
              </p>
              <input
                type="range"
                min={goalSliderRange.min}
                max={goalSliderRange.max}
                step={goalSliderRange.step}
                value={goalTimeSecs}
                onChange={(e) => { setGoalTimeSecs(Number(e.target.value)); }}
                className="w-full accent-brand"
              />
            </div>
          )}
        </div>

        {/* Race date */}
        <div>
          <label className="block text-sm font-semibold text-muted mb-2">
            Race-ready by
          </label>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={raceDate}
              min={minDate}
              onChange={(e) => { setRaceDate(e.target.value); }}
              className="flex-1 px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
            {weeksToGo > 0 && (
              <span className="text-sm font-medium text-brand whitespace-nowrap">
                {weeksToGo} weeks
              </span>
            )}
          </div>
        </div>
      </fieldset>

      {error && (
        <p className="text-error text-sm mt-4">{error}</p>
      )}

      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          disabled={saving}
          className="px-6 py-3 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={() => { void handleNext(); }}
          disabled={!canProceed || saving}
          className="flex-1 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Next"}
        </button>
      </div>
    </div>
  );
}
