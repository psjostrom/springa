"use client";

import { useState } from "react";

interface ScheduleStepProps {
  runDays: number[];
  longRunDay?: number;
  clubDay?: number;
  clubType?: string;
  onNext: (schedule: { runDays: number[]; longRunDay: number; clubDay?: number; clubType?: string }) => void;
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

const CLUB_TYPES = [
  { value: "intervals", label: "Intervals / speed" },
  { value: "easy", label: "Easy / social" },
  { value: "tempo", label: "Tempo / race pace" },
];

export function ScheduleStep({ runDays: initialDays, longRunDay: initialLongDay, clubDay: initialClubDay, clubType: initialClubType, onNext, onBack }: ScheduleStepProps) {
  const [runDays, setRunDays] = useState<number[]>(initialDays);
  const [longRunDay, setLongRunDay] = useState<number | null>(initialLongDay ?? null);
  const [hasClub, setHasClub] = useState(initialClubDay != null);
  const [clubDay, setClubDay] = useState<number | null>(initialClubDay ?? null);
  const [clubType, setClubType] = useState(initialClubType ?? "intervals");

  const toggleDay = (day: number) => {
    let next: number[];
    if (runDays.includes(day)) {
      next = runDays.filter((d) => d !== day);
      // Clear long run day / club day if removed
      if (longRunDay === day) setLongRunDay(null);
      if (clubDay === day) setClubDay(null);
    } else {
      next = [...runDays, day].sort();
    }
    setRunDays(next);
    // Auto-select long run day if only one option or Sunday is available
    if (longRunDay === null || !next.includes(longRunDay)) {
      if (next.includes(0)) setLongRunDay(0);
      else if (next.length === 1) setLongRunDay(next[0]);
      else setLongRunDay(null);
    }
  };

  const handleNext = async () => {
    if (runDays.length < 2 || longRunDay === null) return;

    const schedule: { runDays: number[]; longRunDay: number; clubDay?: number; clubType?: string } = {
      runDays,
      longRunDay,
    };
    if (hasClub && clubDay !== null) {
      schedule.clubDay = clubDay;
      schedule.clubType = clubType;
    }

    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedule),
    });
    if (!res.ok) return;

    onNext(schedule);
  };

  const availableForLong = runDays;
  const availableForClub = runDays.filter((d) => d !== longRunDay);
  const canProceed = runDays.length >= 2 && longRunDay !== null;

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Running Schedule</h2>
      <p className="text-muted mb-6">
        Which days can you run? Pick at least 2.
      </p>

      {/* Day picker */}
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

      {/* Long run day picker */}
      {runDays.length >= 2 && (
        <div className="space-y-2 mb-6">
          <p className="text-sm font-semibold text-text">Which day is your long run?</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.filter(({ index }) => availableForLong.includes(index)).map(({ index, label }) => (
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

      {/* Club run toggle */}
      {runDays.length >= 3 && longRunDay !== null && (
        <div className="space-y-3 mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hasClub}
              onChange={(e) => {
                setHasClub(e.target.checked);
                if (!e.target.checked) setClubDay(null);
              }}
              className="accent-brand w-4 h-4"
            />
            <span className="text-sm text-text">I run with a club</span>
          </label>

          {hasClub && (
            <div className="space-y-3 pl-7">
              <div>
                <p className="text-xs text-muted mb-2">Which day?</p>
                <div className="flex flex-wrap gap-2">
                  {DAYS.filter(({ index }) => availableForClub.includes(index)).map(({ index, label }) => (
                    <button
                      key={index}
                      onClick={() => { setClubDay(index); }}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                        clubDay === index
                          ? "border-brand bg-brand/10 text-brand font-medium"
                          : "border-border text-muted hover:border-brand hover:text-brand"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {clubDay !== null && (
                <div>
                  <p className="text-xs text-muted mb-2">What type of run?</p>
                  <div className="flex flex-wrap gap-2">
                    {CLUB_TYPES.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => { setClubType(value); }}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                          clubType === value
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
            </div>
          )}
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
