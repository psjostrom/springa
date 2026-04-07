"use client";

import { useState } from "react";

interface ScheduleStepProps {
  runDays: number[];
  longRunDay?: number;
  onNext: (schedule: { runDays: number[]; longRunDay: number }) => void;
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

export function ScheduleStep({ runDays: initialDays, longRunDay: initialLongDay, onNext, onBack }: ScheduleStepProps) {
  const [runDays, setRunDays] = useState<number[]>(initialDays);
  const [longRunDay, setLongRunDay] = useState<number | null>(initialLongDay ?? null);

  const toggleDay = (day: number) => {
    let next: number[];
    if (runDays.includes(day)) {
      next = runDays.filter((d) => d !== day);
      if (longRunDay === day) setLongRunDay(null);
    } else {
      next = [...runDays, day].sort();
    }
    setRunDays(next);
    // Auto-select long run day
    if (longRunDay === null || !next.includes(longRunDay)) {
      if (next.includes(0)) setLongRunDay(0);
      else if (next.length === 1) setLongRunDay(next[0]);
      else setLongRunDay(null);
    }
  };

  const handleNext = async () => {
    if (runDays.length < 2 || longRunDay === null) return;

    const schedule = { runDays, longRunDay };
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedule),
    });
    if (!res.ok) return;

    onNext(schedule);
  };

  const canProceed = runDays.length >= 2 && longRunDay !== null;

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Running Schedule</h2>
      <p className="text-muted mb-6">
        Which days can you run? Pick at least 2.
      </p>

      <div className="grid grid-cols-7 gap-2 mb-2">
        {DAYS.map(({ index, label }) => {
          const isSelected = runDays.includes(index);
          return (
            <button
              key={index}
              onClick={() => { toggleDay(index); }}
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
          ? "Select at least 2 days"
          : runDays.length === 1
            ? "Select at least one more day"
            : runDays.length === 2
              ? "2 days — easy runs only, no speed work"
              : `${runDays.length} days selected`}
      </p>

      {runDays.length >= 2 && (
        <div className="space-y-2 mb-6">
          <p className="text-sm font-semibold text-text">Which day is your long run?</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.filter(({ index }) => runDays.includes(index)).map(({ index, label }) => (
              <button
                key={index}
                onClick={() => { setLongRunDay(index); }}
                className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                  longRunDay === index
                    ? "border-brand bg-brand/10 text-brand font-medium"
                    : "border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
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
