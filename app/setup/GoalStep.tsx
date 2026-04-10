"use client";

import { useState } from "react";
import { getPaceTable, getDefaultGoalTime, getSliderRange, DISTANCE_OPTIONS, type ExperienceLevel } from "@/lib/paceTable";
import { formatPace, formatGoalTime } from "@/lib/format";
import { addWeeks, format, differenceInWeeks, parseISO, isBefore } from "date-fns";

interface GoalStepProps {
  raceDate?: string;
  raceDist?: number;
  currentAbilitySecs?: number;
  goalTime?: number;
  onNext: (data: {
    raceDist: number;
    currentAbilitySecs: number;
    currentAbilityDist: number;
    goalTime?: number;
    raceDate: string;
  }) => void;
  onBack: () => void;
}

const EXPERIENCE_OPTIONS: { level: ExperienceLevel; label: string; desc: string }[] = [
  { level: "beginner", label: "Beginner", desc: "New to running or getting back into it" },
  { level: "intermediate", label: "Intermediate", desc: "Run regularly, done a race or two" },
  { level: "experienced", label: "Experienced", desc: "Running for years with specific goals" },
];

export function GoalStep({ raceDate: initialDate, raceDist: initialDist, currentAbilitySecs: initialAbility, goalTime: initialGoalTime, onNext, onBack }: GoalStepProps) {
  const isStandardDist = initialDist != null && DISTANCE_OPTIONS.some(({ km }) => km === initialDist);
  const [selectedDist, setSelectedDist] = useState<number | null>(initialDist ?? null);
  const [customDist, setCustomDist] = useState(initialDist != null && !isStandardDist ? String(initialDist) : "");
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [abilitySecs, setAbilitySecs] = useState<number | null>(initialAbility ?? null);
  const [goalMode, setGoalMode] = useState<"finish" | "time">(initialGoalTime != null ? "time" : "finish");
  const [goalTimeSecs, setGoalTimeSecs] = useState<number | undefined>(initialGoalTime ?? undefined);
  const [raceDate, setRaceDate] = useState(initialDate ?? format(addWeeks(new Date(), 18), "yyyy-MM-dd"));

  const handleDist = (km: number) => {
    setSelectedDist(km);
    setCustomDist("");
    if (experience) {
      const defaultTime = getDefaultGoalTime(km, experience);
      setAbilitySecs(defaultTime);
      if (goalMode === "time") setGoalTimeSecs(defaultTime);
    }
  };

  const handleCustomDist = (value: string) => {
    setCustomDist(value);
    const km = Number(value);
    if (km >= 1 && km <= 100) {
      setSelectedDist(km);
      if (experience) {
        const defaultTime = getDefaultGoalTime(km, experience);
        setAbilitySecs(defaultTime);
        if (goalMode === "time") setGoalTimeSecs(defaultTime);
      }
    } else {
      setSelectedDist(null);
    }
  };

  const handleExperience = (level: ExperienceLevel) => {
    setExperience(level);
    // Use the level arg directly (not `experience` state which is stale in this handler)
    if (selectedDist) {
      const defaultTime = getDefaultGoalTime(selectedDist, level);
      setAbilitySecs(defaultTime);
      if (goalMode === "time") setGoalTimeSecs(defaultTime);
    }
  };

  const sliderRange = selectedDist ? getSliderRange(selectedDist) : null;

  const pacePreview = selectedDist && abilitySecs
    ? getPaceTable(selectedDist, abilitySecs)
    : null;

  const minDate = format(addWeeks(new Date(), 12), "yyyy-MM-dd");
  const weeksToGo = differenceInWeeks(parseISO(raceDate), new Date());
  const dateTooSoon = isBefore(parseISO(raceDate), addWeeks(new Date(), 12));

  const canProceed = selectedDist != null && abilitySecs != null && !dateTooSoon;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = async () => {
    if (!selectedDist || !abilitySecs) return;
    setSaving(true);
    setError(null);
    const payload = {
      raceDist: selectedDist,
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
      onNext({
        raceDist: selectedDist,
        currentAbilitySecs: abilitySecs,
        currentAbilityDist: selectedDist,
        goalTime: goalMode === "time" ? goalTimeSecs : undefined,
        raceDate,
      });
    } catch {
      setError("Connection error. Check your internet and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Your Running Goal</h2>
      <p className="text-muted mb-6">
        We&apos;ll build your training plan around this.
      </p>

      <fieldset disabled={saving} className="space-y-6">
        {/* Section 1: Distance (always visible) */}
        <div>
          <label className="block text-sm font-semibold text-muted mb-2">
            Distance
          </label>
          <div className="grid grid-cols-4 gap-2">
            {DISTANCE_OPTIONS.map(({ label, km }) => (
              <button
                key={km}
                onClick={() => { handleDist(km); }}
                className={`py-3 rounded-lg border-2 font-semibold text-sm transition ${
                  selectedDist === km && !customDist
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={1}
            max={100}
            value={customDist}
            onChange={(e) => { handleCustomDist(e.target.value); }}
            className="mt-2 w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
            placeholder="Custom distance (km)"
          />
        </div>

        {/* Section 2: Experience (visible when distance selected) */}
        {selectedDist != null && (
          <div>
            <label className="block text-sm font-semibold text-muted mb-2">
              Experience
            </label>
            <div className="space-y-2">
              {EXPERIENCE_OPTIONS.map(({ level, label, desc }) => (
                <button
                  key={level}
                  onClick={() => { handleExperience(level); }}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${
                    experience === level
                      ? "border-brand bg-brand/10"
                      : "border-border hover:border-brand"
                  }`}
                >
                  <span className={`font-semibold text-sm ${experience === level ? "text-brand" : "text-text"}`}>
                    {label}
                  </span>
                  <span className="block text-xs text-muted mt-0.5">{desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Section 3: Current ability slider + Paces (visible when experience selected) */}
        {experience != null && abilitySecs != null && sliderRange && (
          <div>
            <label className="block text-sm font-semibold text-muted mb-1">
              About how fast could you run {selectedDist} km on a flat road right now?
            </label>
            <p className="text-xs text-muted mb-3">
              This isn&apos;t a goal — it&apos;s where you are today. We&apos;ll build from here.
            </p>
            <p className="text-4xl font-bold text-text text-center mb-4">
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

            {pacePreview && (
              <div className="bg-surface-alt border border-border rounded-lg p-4 mt-4 space-y-1 text-sm">
                <p className="text-text font-semibold mb-2">Your training paces</p>
                <div className="flex justify-between text-muted">
                  <span>Easy</span>
                  <span>{formatPace(pacePreview.easy.min)} &ndash; {formatPace(pacePreview.easy.max)} /km</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Race</span>
                  <span>{formatPace(pacePreview.steady.min)} &ndash; {formatPace(pacePreview.steady.max)} /km</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Intervals</span>
                  <span>{formatPace(pacePreview.tempo.min)} &ndash; {formatPace(pacePreview.tempo.max)} /km</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 4: Race goal (visible when ability set) */}
        {abilitySecs != null && experience != null && (
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
                onClick={() => { setGoalMode("time"); setGoalTimeSecs(goalTimeSecs ?? abilitySecs); }}
                className={`py-3 rounded-lg border-2 font-semibold text-sm transition ${
                  goalMode === "time"
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                Set a finish time
              </button>
            </div>

            {goalMode === "time" && goalTimeSecs != null && sliderRange && (
              <div className="mt-4">
                <p className="text-xs text-muted mb-2">
                  What time are you aiming for?
                </p>
                <p className="text-3xl font-bold text-text text-center mb-3">
                  {formatGoalTime(goalTimeSecs)}
                </p>
                <input
                  type="range"
                  min={sliderRange.min}
                  max={sliderRange.max}
                  step={sliderRange.step}
                  value={goalTimeSecs}
                  onChange={(e) => { setGoalTimeSecs(Number(e.target.value)); }}
                  className="w-full accent-brand"
                />
              </div>
            )}
          </div>
        )}

        {/* Section 5: Date (visible when ability set) */}
        {abilitySecs != null && (
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
        )}
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
