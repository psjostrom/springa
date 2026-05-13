"use client";

import { useState } from "react";
import type { CategoryBGResponse } from "@/lib/bgModel";
import type { WorkoutCategory } from "@/lib/types";
import { perHour, rateColor, rateLabel } from "@/lib/bgRateDisplay";

interface BGCompactProps {
  categories: CategoryBGResponse[];
}

const LABELS: Record<WorkoutCategory, string> = {
  easy: "Easy",
  long: "Long",
  interval: "Interval",
};

const CONFIDENCE_LABELS: Record<"low" | "medium" | "high", string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

function CategoryPopover({ cat, onClose }: { cat: CategoryBGResponse; onClose: () => void }) {
  const avgPerHour = perHour(cat.avgRate);
  const medianPerHour = perHour(cat.medianRate);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl border border-border p-4 w-64 shadow-xl"
        onClick={(e) => { e.stopPropagation(); }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-text">{LABELS[cat.category]} Runs</span>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-text text-sm">✕</button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Avg drop rate</span>
            <span className="font-semibold" style={{ color: rateColor(avgPerHour) }}>
              {avgPerHour > 0 ? "+" : ""}{avgPerHour.toFixed(1)} mmol/hr
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Median rate</span>
            <span className="text-text">{medianPerHour > 0 ? "+" : ""}{medianPerHour.toFixed(1)} mmol/hr</span>
          </div>
          {cat.avgFuelRate != null && (
            <div className="flex justify-between">
              <span className="text-muted">Avg fuel</span>
              <span className="text-text">{Math.round(cat.avgFuelRate)} g/h</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted">Runs analyzed</span>
            <span className="text-text">{cat.activityCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Data points</span>
            <span className="text-text">{cat.sampleCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Confidence</span>
            <span className="text-text">{CONFIDENCE_LABELS[cat.confidence]}</span>
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
    <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {categories.map((cat) => {
          // Median over avg: per-window slopes for stable runs cancel and
          // round to "-0.0" — useless. Median is robust.
          const rate = perHour(cat.medianRate);
          return (
            <button
              key={cat.category}
              type="button"
              onClick={() => { setSelectedCat(cat); }}
              className="bg-surface-alt rounded-xl border border-border p-3 text-center transition-colors active:bg-border"
            >
              <div className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">{LABELS[cat.category]}</div>
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: rateColor(rate) }}
                />
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{ color: rateColor(rate) }}
                >
                  {rate > 0 ? "+" : ""}{rate.toFixed(1)}
                </span>
                <span className="text-[10px] text-muted">mmol/hr</span>
              </div>
              <div className="text-xs" style={{ color: rateColor(rate) }}>
                {rateLabel(rate)}
              </div>
              {cat.avgFuelRate != null && (
                <div className="text-xs text-muted mt-1">{Math.round(cat.avgFuelRate)} g/h</div>
              )}
            </button>
          );
        })}
      </div>
      {selectedCat && (
        <CategoryPopover cat={selectedCat} onClose={() => { setSelectedCat(null); }} />
      )}
    </div>
  );
}
