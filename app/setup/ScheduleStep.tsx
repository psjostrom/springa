"use client";

import { useState } from "react";

interface ScheduleStepProps {
  runDays: number[];
  onNext: (runDays: number[]) => void;
  onBack: () => void;
}

const DAYS = [
  { index: 1, label: "Mon" },
  { index: 2, label: "Tue" },
  { index: 3, label: "Wed" },
  { index: 4, label: "Thu" },
  { index: 5, label: "Fri" },
  { index: 6, label: "Sat" },
  { index: 0, label: "Sun" },
];

export function ScheduleStep({ runDays: initialDays, onNext, onBack }: ScheduleStepProps) {
  const [runDays, setRunDays] = useState<number[]>(initialDays);

  const toggleDay = (day: number) => {
    if (runDays.includes(day)) {
      setRunDays(runDays.filter((d) => d !== day));
    } else {
      setRunDays([...runDays, day].sort());
    }
  };

  const handleNext = async () => {
    if (runDays.length === 0) return;

    // Save to backend
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runDays }),
    });

    onNext(runDays);
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Running Schedule</h2>
      <p className="text-muted mb-6">
        Which days can you run? Select all that apply.
      </p>

      <div className="grid grid-cols-7 gap-2 mb-6">
        {DAYS.map(({ index, label }) => {
          const isSelected = runDays.includes(index);
          return (
            <button
              key={index}
              onClick={() => toggleDay(index)}
              className={`aspect-square rounded-lg border-2 font-semibold text-sm transition ${
                isSelected
                  ? "bg-brand border-brand text-white"
                  : "border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted mb-6">
        {runDays.length === 0
          ? "Select at least one day"
          : runDays.length === 1
            ? "1 day selected"
            : `${runDays.length} days selected`}
      </p>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={runDays.length === 0}
          className="flex-1 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
