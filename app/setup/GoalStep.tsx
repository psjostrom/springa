"use client";

import { useState } from "react";

interface GoalStepProps {
  raceDate?: string;
  raceName?: string;
  raceDist?: number;
  onNext: (goal: { raceDate?: string; raceName?: string; raceDist?: number }) => void;
  onSkip: () => void;
  onBack: () => void;
}

export function GoalStep({ raceDate: initialDate, raceName: initialName, raceDist: initialDist, onNext, onSkip, onBack }: GoalStepProps) {
  const [hasGoal, setHasGoal] = useState(!!initialDate || !!initialName || !!initialDist);
  const [raceDate, setRaceDate] = useState(initialDate ?? "");
  const [raceName, setRaceName] = useState(initialName ?? "");
  const [raceDist, setRaceDist] = useState(initialDist?.toString() ?? "");

  const handleNext = async () => {
    if (!hasGoal) {
      onSkip();
      return;
    }

    const goal: { raceDate?: string; raceName?: string; raceDist?: number } = {};
    if (raceDate) goal.raceDate = raceDate;
    if (raceName.trim()) goal.raceName = raceName.trim();
    if (raceDist) goal.raceDist = Number(raceDist);

    // Save to backend
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goal),
    });

    onNext(goal);
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Running Goal</h2>
      <p className="text-muted mb-6">
        Are you training for a specific race?
      </p>

      <div className="space-y-4">
        <div className="flex gap-3">
          <button
            onClick={() => setHasGoal(true)}
            className={`flex-1 py-3 rounded-lg border-2 font-semibold transition ${
              hasGoal
                ? "border-brand bg-brand/10 text-brand"
                : "border-border text-muted hover:border-brand hover:text-brand"
            }`}
          >
            Yes, I have a race
          </button>
          <button
            onClick={() => setHasGoal(false)}
            className={`flex-1 py-3 rounded-lg border-2 font-semibold transition ${
              !hasGoal
                ? "border-brand bg-brand/10 text-brand"
                : "border-border text-muted hover:border-brand hover:text-brand"
            }`}
          >
            Just running
          </button>
        </div>

        {hasGoal && (
          <div className="space-y-3 mt-6">
            <div>
              <label className="block text-sm font-semibold text-muted mb-2">
                Race Name
              </label>
              <input
                type="text"
                value={raceName}
                onChange={(e) => setRaceName(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="e.g. EcoTrail Stockholm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted mb-2">
                Race Date
              </label>
              <input
                type="date"
                value={raceDate}
                onChange={(e) => setRaceDate(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-muted mb-2">
                Distance (km)
              </label>
              <input
                type="number"
                min={5}
                max={100}
                value={raceDist}
                onChange={(e) => setRaceDist(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-lg text-text bg-surface-alt focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="16"
              />
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
        {hasGoal ? (
          <button
            onClick={handleNext}
            className="flex-1 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="flex-1 py-3 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
