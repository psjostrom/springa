"use client";

import { useState } from "react";
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
  if (rate > -0.5) return "#4ade80";
  if (rate > -1.5) return "#ffb800";
  return "#ff4d6a";
}

function rateLabel(rate: number): string {
  if (rate > -0.5) return "Stable";
  if (rate > -1.5) return "Moderate";
  return "Fast drop";
}

const CONFIDENCE_LABELS: Record<"low" | "medium" | "high", string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

function CategoryPopover({ cat, onClose }: { cat: CategoryBGResponse; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1d1828] rounded-xl border border-[#2e293c] p-4 w-64 shadow-xl"
        onClick={(e) => { e.stopPropagation(); }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">{LABELS[cat.category]} Runs</span>
          <button onClick={onClose} aria-label="Close" className="text-[#af9ece] hover:text-white text-sm">✕</button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#af9ece]">BG drop rate</span>
            <span className="font-semibold" style={{ color: rateColor(cat.avgRate) }}>
              {cat.avgRate.toFixed(2)} /5m
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#af9ece]">Median rate</span>
            <span className="text-white">{cat.medianRate.toFixed(2)} /5m</span>
          </div>
          {cat.avgFuelRate != null && (
            <div className="flex justify-between">
              <span className="text-[#af9ece]">Avg fuel</span>
              <span className="text-white">{Math.round(cat.avgFuelRate)} g/h</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[#af9ece]">Runs analyzed</span>
            <span className="text-white">{cat.activityCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#af9ece]">Data points</span>
            <span className="text-white">{cat.sampleCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#af9ece]">Confidence</span>
            <span className="text-white">{CONFIDENCE_LABELS[cat.confidence]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BGCompact({ categories }: BGCompactProps) {
  const [selectedCat, setSelectedCat] = useState<CategoryBGResponse | null>(null);

  if (categories.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {categories.map((cat) => (
          <button
            key={cat.category}
            type="button"
            onClick={() => { setSelectedCat(cat); }}
            className="bg-[#1d1828] rounded-xl border border-[#2e293c] p-3 text-center transition-colors active:bg-[#2e293c]"
          >
            <div className="text-xs text-[#af9ece] uppercase tracking-wider font-semibold mb-1">{LABELS[cat.category]}</div>
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
              <div className="text-xs text-[#af9ece] mt-1">{Math.round(cat.avgFuelRate)} g/h</div>
            )}
          </button>
        ))}
      </div>
      {selectedCat && (
        <CategoryPopover cat={selectedCat} onClose={() => { setSelectedCat(null); }} />
      )}
    </>
  );
}
