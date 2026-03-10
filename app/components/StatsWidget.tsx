"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { WidgetProps } from "@/lib/modalWidgets";

function StatInfo({ label, tip }: { label: string; tip: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex items-center gap-0.5"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      {label}
      <button
        type="button"
        aria-label={`Info about ${label.split(" ")[0].toLowerCase()}`}
        onClick={() => { setOpen((v) => !v); }}
        className="text-[#b8a5d4] hover:text-white transition-colors"
      >
        <Info className="w-3 h-3" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 rounded-lg bg-[#0d0a1a] text-white text-sm leading-relaxed px-3 py-2 shadow-lg border border-[#3d2b5a] z-10">
          {tip}
        </span>
      )}
    </span>
  );
}

/** Secondary stats row: calories, cadence, max HR, load, intensity. */
export function StatsWidget({ event }: WidgetProps) {
  const items: React.ReactNode[] = [];
  if (event.calories) items.push(<span key="cal">{event.calories} kcal</span>);
  if (event.cadence) items.push(<span key="cad">{Math.round(event.cadence)} spm</span>);
  if (event.maxHr) items.push(<span key="mhr">Max HR {event.maxHr} bpm</span>);
  if (event.load) items.push(<StatInfo key="load" label={`Load ${Math.round(event.load)}`} tip="Training load estimates how hard an activity was relative to your capabilities. It is calculated from heart rate and pace. 1 hour at threshold is roughly 100 load." />);
  if (event.intensity !== undefined) items.push(<StatInfo key="int" label={`Intensity ${Math.round(event.intensity)}%`} tip="Intensity measures how hard the activity was compared to your threshold. Over 100% for an hour or longer suggests your threshold setting is too low." />);
  if (items.length === 0) return null;

  return (
    <div className="px-4 py-2 flex flex-wrap items-center gap-x-1 text-sm text-[#b8a5d4]">
      {items.flatMap((item, i) => i > 0 ? [<span key={`sep-${i}`}>·</span>, item] : [item])}
    </div>
  );
}
