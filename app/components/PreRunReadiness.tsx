"use client";

import { useMemo } from "react";
import type { BGResponseModel } from "@/lib/bgModel";
import type { WorkoutCategory } from "@/lib/types";
import { assessReadiness, type ReadinessLevel } from "@/lib/prerun";
import { bgColor } from "./CurrentBGPill";

interface PreRunReadinessProps {
  currentBG: number;
  trendSlope: number | null;
  trend: string | null;
  bgModel: BGResponseModel | null;
  category: WorkoutCategory;
}

const LEVEL_COLORS: Record<ReadinessLevel, string> = {
  ready: "#39ff14",
  caution: "#fbbf24",
  wait: "#ff3366",
};

const LEVEL_LABELS: Record<ReadinessLevel, string> = {
  ready: "READY TO RUN",
  caution: "HEADS UP",
  wait: "HOLD ON",
};

export function PreRunReadiness({
  currentBG,
  trendSlope,
  trend,
  bgModel,
  category,
}: PreRunReadinessProps) {
  const guidance = useMemo(
    () => assessReadiness({ currentBG, trendSlope, bgModel, category }),
    [currentBG, trendSlope, bgModel, category],
  );

  const levelColor = LEVEL_COLORS[guidance.level];
  const color = bgColor(currentBG);

  return (
    <div className="mb-4 rounded-xl bg-[#0d0a1a] border border-[#3d2b5a] overflow-hidden">
      {/* Header row */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: levelColor, boxShadow: `0 0 8px ${levelColor}80` }}
          />
          <span
            className="text-sm font-bold tracking-wide"
            style={{ color: levelColor, textShadow: `0 0 10px ${levelColor}40` }}
          >
            {LEVEL_LABELS[guidance.level]}
          </span>
        </div>
        {/* BG value + trend */}
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-xl font-bold"
            style={{ color, textShadow: `0 0 12px ${color}60` }}
          >
            {currentBG.toFixed(1)}
          </span>
          <span className="text-xs text-[#b8a5d4]">mmol/L</span>
          {trend && (
            <span className="text-lg" style={{ color }}>
              {trend}
            </span>
          )}
          {trendSlope !== null && (
            <span className="text-xs text-[#b8a5d4]">
              {trendSlope > 0 ? "+" : ""}{trendSlope.toFixed(1)}/10m
            </span>
          )}
        </div>
      </div>

      {/* Reasons */}
      {guidance.reasons.length > 0 && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-[#1e1535] border border-[#3d2b5a]">
          <div className="text-xs text-[#b8a5d4] font-medium mb-0.5 uppercase tracking-wider">Assessment</div>
          {guidance.reasons.map((r, i) => (
            <div key={i} className="text-sm text-white/90">{r}</div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {guidance.suggestions.length > 0 && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-[#1e1535] border border-[#3d2b5a]">
          <div className="text-xs text-[#b8a5d4] font-medium mb-0.5 uppercase tracking-wider">Recommendation</div>
          {guidance.suggestions.map((s, i) => (
            <div key={i} className="text-sm text-white/90">{s}</div>
          ))}
        </div>
      )}

      {/* Prediction row */}
      {guidance.estimatedBGAt30m !== null && (
        <div className="mx-3 mb-3 flex items-center gap-2 text-sm text-[#b8a5d4]">
          <span>30-min forecast:</span>
          <span
            className="font-semibold"
            style={{ color: bgColor(guidance.estimatedBGAt30m) }}
          >
            {guidance.estimatedBGAt30m.toFixed(1)} mmol/L
          </span>
          <span className="text-xs">
            ({guidance.predictedDrop !== null && guidance.predictedDrop > 0 ? "+" : ""}
            {guidance.predictedDrop?.toFixed(1)})
          </span>
        </div>
      )}
    </div>
  );
}
