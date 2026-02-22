"use client";

import { useState, useCallback, useMemo } from "react";
import type { BGResponseModel } from "@/lib/bgModel";
import type { WorkoutCategory } from "@/lib/types";
import { assessReadiness, type ReadinessLevel } from "@/lib/prerun";
import { bgColor } from "./CurrentBGPill";

interface PreRunOverlayProps {
  currentBG: number;
  trendSlope: number | null;
  trend: string | null;
  bgModel: BGResponseModel | null;
  onClose: () => void;
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

const CATEGORIES: { value: WorkoutCategory; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "long", label: "Long" },
  { value: "interval", label: "Interval" },
];

export function PreRunOverlay({
  currentBG,
  trendSlope,
  trend,
  bgModel,
  onClose,
}: PreRunOverlayProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [category, setCategory] = useState<WorkoutCategory>("easy");

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 250);
  }, [onClose]);

  const guidance = useMemo(
    () => assessReadiness({ currentBG, trendSlope, bgModel, category }),
    [currentBG, trendSlope, bgModel, category],
  );

  const levelColor = LEVEL_COLORS[guidance.level];
  const color = bgColor(currentBG);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4 transition-colors duration-250 ${isClosing ? "bg-black/0" : "bg-black/70"}`}
      onClick={handleClose}
    >
      <div
        className={`bg-[#0d0a1a] rounded-t-2xl sm:rounded-xl w-full sm:max-w-md shadow-xl shadow-[#00ffff]/10 border-t sm:border border-[#1e1535] ${isClosing ? "animate-slide-down" : "animate-slide-up"}`}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: levelColor, boxShadow: `0 0 8px ${levelColor}80` }}
            />
            <span
              className="text-lg font-bold tracking-wide"
              style={{ color: levelColor, textShadow: `0 0 10px ${levelColor}40` }}
            >
              {LEVEL_LABELS[guidance.level]}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="text-[#b8a5d4] hover:text-white text-xl leading-none px-1"
          >
            ✕
          </button>
        </div>

        {/* Current BG */}
        <div className="px-4 py-2 flex items-baseline gap-2">
          <span
            className="text-3xl font-bold"
            style={{ color, textShadow: `0 0 12px ${color}60` }}
          >
            {currentBG.toFixed(1)}
          </span>
          <span className="text-sm text-[#b8a5d4]">mmol/L</span>
          {trend && (
            <span className="text-xl" style={{ color }}>
              {trend}
            </span>
          )}
          {trendSlope !== null && (
            <span className="text-sm text-[#b8a5d4]">
              {trendSlope > 0 ? "+" : ""}{trendSlope.toFixed(1)}/10m
            </span>
          )}
        </div>

        {/* Reasons */}
        {guidance.reasons.length > 0 && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-[#1e1535] border border-[#3d2b5a]">
            <div className="text-xs text-[#b8a5d4] font-medium mb-1 uppercase tracking-wider">Assessment</div>
            {guidance.reasons.map((r, i) => (
              <div key={i} className="text-sm text-white/90">{r}</div>
            ))}
          </div>
        )}

        {/* Suggestions */}
        {guidance.suggestions.length > 0 && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-[#1e1535] border border-[#3d2b5a]">
            <div className="text-xs text-[#b8a5d4] font-medium mb-1 uppercase tracking-wider">Recommendation</div>
            {guidance.suggestions.map((s, i) => (
              <div key={i} className="text-sm text-white/90">{s}</div>
            ))}
          </div>
        )}

        {/* Prediction row */}
        {guidance.estimatedBGAt30m !== null && (
          <div className="mx-4 mb-2 flex items-center gap-2 text-sm text-[#b8a5d4]">
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

        {/* Category selector */}
        <div className="px-4 pt-2 pb-4 flex gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                category === c.value
                  ? "border-[#00ffff] text-[#00ffff] bg-[#00ffff10]"
                  : "border-[#3d2b5a] text-[#b8a5d4] hover:border-[#00ffff40] hover:text-white"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
