"use client";

import { useState, useEffect } from "react";

export function bgColor(mmol: number): string {
  if (mmol < 3.5 || mmol > 14.0) return "#ff3366";
  if (mmol < 4.0 || mmol > 10.0) return "#fbbf24";
  return "#39ff14";
}

function relativeTime(date: Date, now: number): string {
  const diffMin = Math.floor((now - date.getTime()) / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

interface CurrentBGPillProps {
  currentBG: number | null;
  trend: string | null;
  lastUpdate: Date | null;
  onClick?: () => void;
}

export function CurrentBGPill({
  currentBG,
  trend,
  lastUpdate,
  onClick,
}: CurrentBGPillProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => { setNow(Date.now()); }, 30_000);
    return () => { clearInterval(id); };
  }, []);

  if (currentBG == null || lastUpdate == null) return null;

  // Don't show stale data (>15 min old)
  if (now - lastUpdate.getTime() > 15 * 60 * 1000) return null;

  const color = bgColor(currentBG);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold border transition-transform hover:scale-105 active:scale-95"
      style={{
        color,
        borderColor: color + "40",
        backgroundColor: color + "15",
        textShadow: `0 0 8px ${color}60`,
      }}
    >
      <span>{currentBG.toFixed(1)}</span>
      {trend && <span>{trend}</span>}
      <span
        className="text-xs font-normal opacity-70"
        style={{ color }}
      >
        {relativeTime(lastUpdate, now)}
      </span>
    </button>
  );
}
