"use client";

import { Gauge } from "lucide-react";
import type { HRZoneName } from "@/lib/types";
import type { CalibratedPaceTable } from "@/lib/paceCalibration";
import { computeZonePaceTrend } from "@/lib/paceCalibration";
import { ZONE_COLORS } from "@/lib/constants";
import { formatPace } from "@/lib/format";

interface PaceCalibrationCardProps {
  calibration: CalibratedPaceTable;
  lthr: number;
}

const ZONE_META: { zone: HRZoneName; label: string; color: string }[] = [
  { zone: "easy", label: "Easy", color: ZONE_COLORS.z2 },
  { zone: "steady", label: "Steady", color: ZONE_COLORS.z3 },
  { zone: "tempo", label: "Tempo", color: ZONE_COLORS.z4 },
  { zone: "hard", label: "Hard", color: ZONE_COLORS.z5 },
];

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

export function PaceCalibrationCard({ calibration, lthr }: PaceCalibrationCardProps) {
  const { table, segments, zoneSummaries, hardExtrapolated } = calibration;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Gauge className="w-4 h-4 text-[#06b6d4]" />
        <span className="text-sm font-semibold uppercase text-[#b8a5d4]">
          Pace Zones
        </span>
        <span className="text-xs text-[#8b7ba8]">
          LTHR {lthr}
        </span>
      </div>

      <div className="bg-[#1e1535] rounded-lg border border-[#3d2b5a] overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-3 py-2 border-b border-[#3d2b5a] text-xs text-[#8b7ba8]">
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
              className="flex items-center px-3 py-2 border-b border-[#3d2b5a] last:border-b-0"
            >
              {/* Zone dot + label */}
              <div className="w-16 flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm text-[#c4b5fd]">{label}</span>
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
                {isHardExtrapolated && (
                  <span className="text-[10px] text-[#d946ef] ml-1">extrap.</span>
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
    </div>
  );
}
