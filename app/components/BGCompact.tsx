"use client";

import type { CategoryBGResponse } from "@/lib/bgModel";
import type { WorkoutCategory } from "@/lib/types";

interface BGCompactProps {
  categories: CategoryBGResponse[];
}

const LABELS: Record<WorkoutCategory, string> = {
  easy: "Easy",
  long: "Long",
  interval: "Interval",
};

function rateColor(rate: number): string {
  if (rate > -0.5) return "#39ff14";
  if (rate > -1.5) return "#fbbf24";
  return "#ff3366";
}

function rateLabel(rate: number): string {
  if (rate > -0.5) return "Stable";
  if (rate > -1.5) return "Moderate";
  return "Fast drop";
}

export function BGCompact({ categories }: BGCompactProps) {
  if (categories.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {categories.map((cat) => (
        <div
          key={cat.category}
          className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-3 text-center"
        >
          <div className="text-xs text-[#b8a5d4] mb-1">{LABELS[cat.category]}</div>
          <div className="flex items-center justify-center gap-1.5 mb-0.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: rateColor(cat.avgRate) }}
            />
            <span
              className="text-lg font-bold tabular-nums"
              style={{ color: rateColor(cat.avgRate) }}
            >
              {cat.avgRate.toFixed(1)}
            </span>
          </div>
          <div className="text-xs" style={{ color: rateColor(cat.avgRate) }}>
            {rateLabel(cat.avgRate)}
          </div>
          {cat.avgFuelRate != null && (
            <div className="text-xs text-[#6b5b8a] mt-1">{Math.round(cat.avgFuelRate)} g/h</div>
          )}
        </div>
      ))}
    </div>
  );
}
