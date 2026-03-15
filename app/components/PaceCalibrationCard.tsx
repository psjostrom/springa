"use client";

import { useState } from "react";
import type { HRZoneName } from "@/lib/types";
import type { CalibratedPaceTable } from "@/lib/paceCalibration";
import { computeZonePaceTrend } from "@/lib/paceCalibration";
import { ZONE_COLORS } from "@/lib/constants";
import { formatPace } from "@/lib/format";

interface PaceCalibrationCardProps {
  calibration: CalibratedPaceTable;
}

const ZONE_META: { zone: HRZoneName; label: string; color: string }[] = [
  { zone: "easy", label: "Easy", color: ZONE_COLORS.z2 },
  { zone: "steady", label: "Steady", color: ZONE_COLORS.z3 },
  { zone: "tempo", label: "Tempo", color: ZONE_COLORS.z4 },
  { zone: "hard", label: "Hard", color: ZONE_COLORS.z5 },
];

const ZONE_PURPOSE: Record<HRZoneName, string> = {
  easy: "Aerobic base, recovery",
  steady: "Race pace effort",
  tempo: "Threshold, 5K effort",
  hard: "Strides, sprints",
};

function PaceZonesPopover({
  anchorRect,
  calibration,
  onClose,
}: {
  anchorRect: DOMRect;
  calibration: CalibratedPaceTable;
  onClose: () => void;
}) {
  const { segments } = calibration;

  const popoverWidth = 260;
  const popoverHeight = 180;
  const gap = 10;
  const showBelow = anchorRect.top < popoverHeight + gap;

  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const left = Math.min(
    Math.max(12, anchorCenterX - popoverWidth / 2),
    window.innerWidth - popoverWidth - 12,
  );
  const arrowLeft = Math.min(Math.max(16, anchorCenterX - left), popoverWidth - 16);

  const positionStyle: React.CSSProperties = {
    width: popoverWidth,
    left,
    ...(showBelow
      ? { top: anchorRect.bottom + gap }
      : { bottom: window.innerHeight - anchorRect.top + gap }),
  };

  const totalMinutes = segments.reduce((sum, s) => sum + s.durationMin, 0);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-[#1d1828] border border-[#2e293c] rounded-xl px-4 py-3 shadow-lg shadow-black/50"
        style={positionStyle}
      >
        <div className="text-xs text-[#af9ece] leading-relaxed mb-3">
          Pace at each HR zone, calibrated from {totalMinutes} min of training.
        </div>

        {/* Zone purposes */}
        <div className="space-y-1 text-xs">
          {ZONE_META.map(({ zone, label, color }) => (
            <div key={zone} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[#af9ece] font-medium w-12">{label}</span>
              <span className="text-[#8b7ba8]">{ZONE_PURPOSE[zone]}</span>
            </div>
          ))}
        </div>

        {/* Arrow */}
        <div
          className={`absolute w-2.5 h-2.5 bg-[#1d1828] border-[#2e293c] rotate-45 ${
            showBelow ? "-top-[6px] border-l border-t" : "-bottom-[6px] border-r border-b"
          }`}
          style={{ left: arrowLeft }}
        />
      </div>
    </>
  );
}

function TrendArrow({ slope }: { slope: number | null }) {
  if (slope === null) return <span className="text-[#8b7ba8]">—</span>;
  // slope is min/km per day — negative = faster
  if (Math.abs(slope) < 0.003) {
    return <span className="text-[#8b7ba8]">→</span>;
  }
  if (slope < 0) {
    return <span className="text-[#39ff14]">↓</span>;
  }
  return <span className="text-[#ff3366]">↑</span>;
}

export function PaceCalibrationCard({ calibration }: PaceCalibrationCardProps) {
  const { table, segments, zoneSummaries, hardExtrapolated } = calibration;
  const [popover, setPopover] = useState<{ anchorRect: DOMRect } | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (popover) {
      setPopover(null);
    } else {
      setPopover({ anchorRect: e.currentTarget.getBoundingClientRect() });
    }
  };

  return (
    <>
      {popover && (
        <PaceZonesPopover
          anchorRect={popover.anchorRect}
          calibration={calibration}
          onClose={() => { setPopover(null); }}
        />
      )}
      <div
        onClick={handleClick}
        className="bg-[#1d1828] rounded-lg border border-[#2e293c] overflow-hidden cursor-pointer active:bg-[#2e293c] transition-colors"
      >
        {/* Header */}
        <div className="flex items-center px-3 py-2 border-b border-[#2e293c] text-xs text-[#8b7ba8]">
          <span className="w-16">Zone</span>
          <span className="flex-1 text-right">Pace</span>
          <span className="w-12 text-right">HR</span>
          <span className="w-12 text-center">Trend</span>
        </div>

        {ZONE_META.map(({ zone, label, color }) => {
          const entry = table[zone];
          const summary = zoneSummaries.get(zone);
          const trend = zone !== "hard" ? computeZonePaceTrend(segments, zone) : null;
          const isHardExtrapolated = zone === "hard" && hardExtrapolated;

          return (
            <div
              key={zone}
              className="flex items-center px-3 py-2 border-b border-[#2e293c] last:border-b-0"
            >
              {/* Zone dot + label */}
              <div className="flex-shrink-0 flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm text-[#af9ece]">{label}</span>
                {isHardExtrapolated && (
                  <span className="text-[10px] text-[#d946ef]">(extrapolated)</span>
                )}
              </div>

              {/* Pace */}
              <div className="flex-1 text-right">
                <span
                  className={`text-sm tabular-nums ${
                    entry.calibrated ? "font-bold text-white" : "text-[#8b7ba8]"
                  }`}
                >
                  {formatPace(entry.pace)}
                </span>
                {!entry.calibrated && (
                  <span className="text-[10px] text-[#6b5b8a] ml-1">fallback</span>
                )}
              </div>

              {/* Avg HR */}
              <span className="w-12 text-right text-xs tabular-nums text-[#8b7ba8]">
                {summary ? Math.round(summary.avgHr) : "—"}
              </span>

              {/* Trend */}
              <span className="w-12 text-center text-sm">
                <TrendArrow slope={trend} />
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
