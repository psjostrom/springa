"use client";

import { useState } from "react";
import { DISTANCE_OPTIONS, type ExperienceLevel } from "@/lib/paceTable";

interface GoalStepProps {
  raceDist?: number;
  experience?: ExperienceLevel;
  onNext: (data: { raceDist: number; experience: ExperienceLevel }) => void;
  onBack: () => void;
}

const EXPERIENCE_OPTIONS: { level: ExperienceLevel; label: string; desc: string }[] = [
  { level: "beginner", label: "Beginner", desc: "New to running or getting back into it" },
  { level: "intermediate", label: "Intermediate", desc: "Run regularly, done a race or two" },
  { level: "experienced", label: "Experienced", desc: "Running for years with specific goals" },
];

export function GoalStep({ raceDist: initialDist, experience: initialExp, onNext, onBack }: GoalStepProps) {
  const isStandardDist = initialDist != null && DISTANCE_OPTIONS.some(({ km }) => km === initialDist);
  const [selectedDist, setSelectedDist] = useState<number | null>(initialDist ?? null);
  const [customDist, setCustomDist] = useState(initialDist != null && !isStandardDist ? String(initialDist) : "");
  const [experience, setExperience] = useState<ExperienceLevel | null>(initialExp ?? null);

  const handleDist = (km: number) => {
    setSelectedDist(km);
    setCustomDist("");
  };

  const handleCustomDist = (value: string) => {
    setCustomDist(value);
    const km = Number(value);
    if (km >= 1 && km <= 100) {
      setSelectedDist(km);
    } else {
      setSelectedDist(null);
    }
  };

  const canProceed = selectedDist != null && experience != null;

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Your Running Goal</h2>
      <p className="text-muted mb-6">
        We&apos;ll build your training plan around this.
      </p>

      <div className="space-y-6">
        {/* Section 1: Distance */}
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
                  onClick={() => { setExperience(level); }}
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
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition"
        >
          Back
        </button>
        <button
          onClick={() => { if (selectedDist && experience) onNext({ raceDist: selectedDist, experience }); }}
          disabled={!canProceed}
          className="flex-1 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
