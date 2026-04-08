"use client";

import { useState } from "react";
import { getPaceTable, getDefaultGoalTime, getSliderRange, DISTANCE_OPTIONS, type ExperienceLevel } from "@/lib/paceTable";
import { formatPace, formatGoalTime } from "@/lib/format";
import { addWeeks, format, differenceInWeeks, parseISO } from "date-fns";

interface GoalStepProps {
  raceDate?: string;
  raceDist?: number;
  goalTime?: number;
  onNext: (data: { raceDist: number; goalTime: number; raceDate: string }) => void;
  onBack: () => void;
}

const EXPERIENCE_OPTIONS: { level: ExperienceLevel; label: string; desc: string }[] = [
  { level: "beginner", label: "Beginner", desc: "New to running or getting back into it" },
  { level: "intermediate", label: "Intermediate", desc: "Run regularly, done a race or two" },
  { level: "experienced", label: "Experienced", desc: "Running for years with specific goals" },
];

export function GoalStep({ raceDate: initialDate, raceDist: initialDist, goalTime: initialGoalTime, onNext, onBack }: GoalStepProps) {
  const [selectedDist, setSelectedDist] = useState<number | null>(initialDist ?? null);
  const [customDist, setCustomDist] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [goalTimeSecs, setGoalTimeSecs] = useState<number | null>(initialGoalTime ?? null);
  const [raceDate, setRaceDate] = useState(initialDate ?? format(addWeeks(new Date(), 16), "yyyy-MM-dd"));

  const handleDist = (km: number) => {
    setSelectedDist(km);
    setShowCustom(false);
    // Recalculate goal time with new distance (experience is current — no closure issue
    // because we read it directly, and React batches these setState calls in the same event)
    if (experience) {
      setGoalTimeSecs(getDefaultGoalTime(km, experience));
    }
  };

  const handleCustomDist = (value: string) => {
    setCustomDist(value);
    const km = Number(value);
    if (km >= 1 && km <= 100) {
      setSelectedDist(km);
      if (experience) {
        setGoalTimeSecs(getDefaultGoalTime(km, experience));
      }
    } else {
      setSelectedDist(null);
    }
  };

  const handleExperience = (level: ExperienceLevel) => {
    setExperience(level);
    // Use the level arg directly (not `experience` state which is stale in this handler)
    if (selectedDist) {
      setGoalTimeSecs(getDefaultGoalTime(selectedDist, level));
    }
  };

  const sliderRange = selectedDist ? getSliderRange(selectedDist) : null;

  const pacePreview = selectedDist && goalTimeSecs
    ? getPaceTable(selectedDist, goalTimeSecs)
    : null;

  const weeksToGo = differenceInWeeks(parseISO(raceDate), new Date());

  const canProceed = selectedDist != null && goalTimeSecs != null;

  const handleNext = async () => {
    if (!selectedDist || !goalTimeSecs) return;
    const data = { raceDist: selectedDist, goalTime: goalTimeSecs, raceDate };
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return;
    onNext(data);
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Your Running Goal</h2>
      <p className="text-muted mb-6">
        We&apos;ll build your training plan around this.
      </p>

      <div className="space-y-6">
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
                  selectedDist === km && !showCustom
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {!showCustom ? (
            <button
              onClick={() => { setShowCustom(true); setSelectedDist(null); setExperience(null); setGoalTimeSecs(null); }}
              className="mt-2 text-sm text-muted hover:text-brand transition"
            >
              Other distance
            </button>
          ) : (
            <div className="mt-2">
              <input
                type="number"
                min={1}
                max={100}
                value={customDist}
                onChange={(e) => { handleCustomDist(e.target.value); }}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="Distance in km"
                autoFocus
              />
            </div>
          )}
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

        {/* Section 3: Time slider + Paces (visible when experience selected) */}
        {experience != null && goalTimeSecs != null && sliderRange && (
          <div>
            <label className="block text-sm font-semibold text-muted mb-2">
              Current ability
            </label>
            <p className="text-4xl font-bold text-text text-center mb-4">
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

        {/* Section 4: Date (visible when time set) */}
        {goalTimeSecs != null && (
          <div>
            <label className="block text-sm font-semibold text-muted mb-2">
              Race-ready by
            </label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={raceDate}
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
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition"
        >
          Back
        </button>
        <button
          onClick={() => { void handleNext(); }}
          disabled={!canProceed}
          className="flex-1 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
