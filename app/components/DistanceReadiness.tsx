"use client";

import type { LongestRun } from "@/lib/runProfile";

interface Props {
  longestRun: LongestRun | null;
  race: { name?: string; distanceKm?: number; date?: string } | null;
}

export function DistanceReadiness({ longestRun, race }: Props) {
  if (!longestRun) return null;
  const longestKmRaw = longestRun.distanceKm;
  const raceKmRaw = race?.distanceKm ?? null;

  // Skip rendering if longest is zero or negative, or race is invalid
  if (longestKmRaw <= 0 || (raceKmRaw != null && raceKmRaw <= 0)) return null;

  const longestKmDisplay = Math.round(longestKmRaw);
  const raceKmDisplay = raceKmRaw != null ? Math.round(raceKmRaw) : null;
  const gap = raceKmRaw != null ? Math.max(0, raceKmRaw - longestKmRaw) : null;

  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-sm font-bold text-text">Race-distance preparation</h4>
        {race?.name && race.date && (
          <span className="text-xs text-muted">{race.name} · {race.date}</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 my-3">
        <Stat value={longestKmDisplay} label="Longest run" unit="km" />
        {raceKmDisplay != null && <Stat value={raceKmDisplay} label="Race" unit="km" accent="brand" />}
        {gap != null && <Stat value={Math.round(gap)} label="Gap" unit="km" accent="success" />}
      </div>
      {raceKmRaw != null && <ProgressBar pct={Math.min(100, (longestKmRaw / raceKmRaw) * 100)} />}
      <div className="text-xs text-muted pt-3 mt-3 border-t border-border">
        Longest run: <strong className="text-text">{longestRun.name}</strong> on {longestRun.dateISO}
        {gap != null && <> — you&apos;re <strong className="text-text">{Math.round(gap)}km</strong> short of race distance.</>}
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  unit,
  accent,
}: {
  value: number;
  label: string;
  unit: string;
  accent?: "brand" | "success";
}) {
  const valueClass =
    accent === "brand" ? "text-brand" : accent === "success" ? "text-success" : "text-text";
  return (
    <div className="bg-surface-alt rounded-lg p-2 text-center">
      <div className={`text-xl font-extrabold tabular-nums ${valueClass}`}>
        {value}
        <span className="text-[10px] text-muted ml-0.5">{unit}</span>
      </div>
      <div className="text-[10px] text-muted mt-0.5">{label}</div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="relative h-2 bg-surface-alt rounded">
      <div
        className="absolute top-0 bottom-0 left-0 rounded bg-gradient-to-r from-brand to-pink-300"
        style={{ width: `${pct}%` }}
      />
      <div className="absolute -top-1 -bottom-1 w-0.5 bg-text" style={{ left: `${pct}%` }} />
    </div>
  );
}
