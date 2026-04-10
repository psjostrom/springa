"use client";

import { useState } from "react";
import type { UserSettings } from "@/lib/settings";
import { getSliderRange, getDefaultGoalTime } from "@/lib/paceTable";
import { formatGoalTime } from "@/lib/format";

interface PlannerConfigPanelProps {
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
  onDone: () => void;
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

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CLUB_TYPES = [
  { value: "long", label: "Long run" },
  { value: "speed", label: "Speed work" },
  { value: "varies", label: "Varies" },
] as const;

export function PlannerConfigPanel({ settings, onSave, onDone }: PlannerConfigPanelProps) {
  const [runDays, setRunDays] = useState<number[]>(settings.runDays ?? []);
  const [longRunDay, setLongRunDay] = useState<number | undefined>(settings.longRunDay);
  const [hasClub, setHasClub] = useState(settings.clubDay != null);
  const [clubDay, setClubDay] = useState<number | undefined>(settings.clubDay);
  const [clubType, setClubType] = useState<string>(settings.clubType ?? "varies");
  const [raceName, setRaceName] = useState(settings.raceName ?? "");
  const [raceDist, setRaceDist] = useState<number | "">(settings.raceDist ?? "");
  const [raceDate, setRaceDate] = useState(settings.raceDate ?? "");
  const [goalTime, setGoalTime] = useState<number | undefined>(settings.goalTime);
  const effectiveDist = typeof raceDist === "number" ? raceDist : null;

  // When club type is "long", the club day IS the long run day
  const effectiveLongRunDay = hasClub && clubType === "long" && clubDay != null ? clubDay : longRunDay;

  // Available days for club day picker (selected run days minus long run day)
  const clubDayOptions = runDays
    .filter((d) => d !== effectiveLongRunDay || clubType === "long")
    .sort((a, b) => (a || 7) - (b || 7));

  const saveField = async (partial: Partial<UserSettings>) => {
    await onSave(partial);
  };

  const toggleDay = (day: number) => {
    const next = runDays.includes(day)
      ? runDays.filter((d) => d !== day)
      : [...runDays, day].sort((a, b) => a - b);
    if (next.length === 0) return;
    setRunDays(next);
    const updates: Partial<UserSettings> = { runDays: next };
    if (longRunDay != null && !next.includes(longRunDay)) {
      setLongRunDay(undefined);
      updates.longRunDay = undefined;
    }
    if (clubDay != null && !next.includes(clubDay)) {
      setClubDay(undefined);
      updates.clubDay = undefined;
      updates.clubType = undefined;
      setHasClub(false);
    }
    saveField(updates).catch(console.error);
  };

  const handleLongRunDay = (day: number) => {
    setLongRunDay(day);
    saveField({ longRunDay: day }).catch(console.error);
  };

  const handleClubToggle = () => {
    const next = !hasClub;
    setHasClub(next);
    if (!next) {
      setClubDay(undefined);
      saveField({ clubDay: undefined, clubType: undefined }).catch(console.error);
    }
  };

  const handleClubDay = (day: number) => {
    setClubDay(day);
    saveField({ clubDay: day }).catch(console.error);
  };

  const handleClubType = (type: string) => {
    const updates: Partial<UserSettings> = { clubType: type };
    if (type === "long" && clubDay != null) {
      updates.longRunDay = clubDay;
      setLongRunDay(clubDay);
    } else if (clubType === "long" && type !== "long") {
      const firstNonClub = runDays.find((d) => d !== clubDay);
      updates.longRunDay = firstNonClub;
      setLongRunDay(firstNonClub);
    }
    setClubType(type);
    saveField(updates).catch(console.error);
  };

  const handleRaceBlur = () => {
    const updates: Partial<UserSettings> = {};
    if (raceName.trim() !== (settings.raceName ?? "")) updates.raceName = raceName.trim();
    if (raceDate !== (settings.raceDate ?? "")) updates.raceDate = raceDate;
    const rdVal = raceDist === "" ? undefined : raceDist;
    if (rdVal !== settings.raceDist) updates.raceDist = rdVal;
    if (goalTime !== settings.goalTime) updates.goalTime = goalTime;
    if (Object.keys(updates).length > 0) {
      saveField(updates).catch(console.error);
    }
    // Threshold pace is pushed during wizard completion and when ability changes.
    // No need to re-push here — ability doesn't change from race config fields.
  };

  const goalTimeSliderRange = effectiveDist ? getSliderRange(effectiveDist) : null;
  const goalTimeDisplay = goalTime ?? getDefaultGoalTime(effectiveDist ?? 21.0975, "intermediate");

  // Compute speed hint
  const speedHintDay = (() => {
    if (effectiveLongRunDay == null) return null;
    const available = runDays.filter((d) => d !== effectiveLongRunDay && !(hasClub && d === clubDay));
    if (available.length === 0 || runDays.length < 3) return null;
    let bestDay = available[0];
    let bestDist = 0;
    for (const d of available) {
      const dist = Math.min(Math.abs(d - effectiveLongRunDay), 7 - Math.abs(d - effectiveLongRunDay));
      if (dist > bestDist) { bestDist = dist; bestDay = d; }
    }
    return DAY_LABELS[bestDay];
  })();

  return (
    <div className="bg-surface-alt border border-brand rounded-xl p-4 space-y-4">
      {/* Run Days */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Run Days</div>
        <div className="flex gap-1.5">
          {DAYS.map(({ index, label }) => (
            <button
              key={index}
              onClick={() => { toggleDay(index); }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                runDays.includes(index)
                  ? "bg-brand text-white"
                  : "border border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Long Run Day */}
      {!(hasClub && clubType === "long") && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Long Run Day</div>
          <div className="flex gap-1.5 flex-wrap">
            {[...runDays].sort((a, b) => (a || 7) - (b || 7)).map((d) => (
              <button
                key={d}
                onClick={() => { handleLongRunDay(d); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  longRunDay === d
                    ? "bg-brand text-white"
                    : "border border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
          {speedHintDay && (
            <p className="text-[10px] text-muted mt-1.5">Speed auto-assigned to {speedHintDay}</p>
          )}
        </div>
      )}

      {/* Club Run */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Club Run</div>
          <button
            type="button"
            role="switch"
            aria-checked={hasClub}
            onClick={handleClubToggle}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
              hasClub ? "bg-brand" : "bg-surface"
            }`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              hasClub ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
        </div>
        {hasClub && (
          <div className="space-y-2">
            <div className="flex gap-1.5 flex-wrap">
              {clubDayOptions.map((d) => (
                <button
                  key={d}
                  onClick={() => { handleClubDay(d); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    clubDay === d
                      ? "bg-brand text-white"
                      : "border border-border text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {CLUB_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => { handleClubType(value); }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition ${
                    clubType === value
                      ? "bg-brand text-white"
                      : "border border-border text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {clubType === "speed" && (
              <p className="text-[10px] text-muted">Springa skips its own speed session</p>
            )}
            {clubType === "long" && clubDay != null && (
              <p className="text-[10px] text-muted">Club day ({DAY_LABELS[clubDay]}) is the long run day</p>
            )}
          </div>
        )}
      </div>

      {/* Race Goal */}
      <div className="border-t border-border pt-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Race Goal</div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-muted mb-1">Name</label>
              <input
                type="text"
                value={raceName}
                onChange={(e) => { setRaceName(e.target.value); }}
                onBlur={handleRaceBlur}
                className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="EcoTrail Stockholm"
              />
            </div>
            <div className="w-20">
              <label className="block text-[10px] text-muted mb-1">km</label>
              <input
                type="number"
                min={1}
                max={200}
                value={raceDist}
                onChange={(e) => { setRaceDist(e.target.value === "" ? "" : Number(e.target.value)); }}
                onBlur={handleRaceBlur}
                className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
                placeholder="16"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1">Date</label>
            <input
              type="date"
              value={raceDate}
              onChange={(e) => { setRaceDate(e.target.value); }}
              onBlur={handleRaceBlur}
              className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent placeholder:text-muted"
            />
          </div>
          {/* Goal Time */}
          {effectiveDist && goalTimeSliderRange && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                {goalTime != null ? "Current Ability" : "Set Your Goal Time"}
              </div>
              <div className="text-center text-2xl font-bold text-brand mb-2">
                {formatGoalTime(goalTimeDisplay)}
              </div>
              <input
                type="range"
                min={goalTimeSliderRange.min}
                max={goalTimeSliderRange.max}
                step={goalTimeSliderRange.step}
                value={goalTimeDisplay}
                onChange={(e) => { setGoalTime(Number(e.target.value)); }}
                onMouseUp={handleRaceBlur}
                onTouchEnd={handleRaceBlur}
                className="w-full accent-brand"
              />
            </div>
          )}
        </div>
      </div>

      {/* Done */}
      <div className="flex justify-end">
        <button
          onClick={() => { handleRaceBlur(); onDone(); }}
          className="text-brand text-sm font-medium hover:underline"
        >
          Done
        </button>
      </div>
    </div>
  );
}
