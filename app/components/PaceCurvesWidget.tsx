"use client";

import { useState, useRef } from "react";
import { useAtomValue } from "jotai";
import { apiKeyAtom } from "../atoms";
import { usePaceCurves } from "../hooks/usePaceCurves";
import type { PaceCurveData } from "@/lib/types";

const TIME_WINDOWS = [
  { label: "1m", curveId: "30d" },
  { label: "3m", curveId: "90d" },
  { label: "6m", curveId: "180d" },
  { label: "1y", curveId: "1y" },
  { label: "All", curveId: "all" },
] as const;

type TimeWindowOption = (typeof TIME_WINDOWS)[number];

interface PaceCurvesWidgetProps {
  data?: PaceCurveData;
  onActivitySelect?: (activityId: string) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatPace(paceMinPerKm: number): string {
  const mins = Math.floor(paceMinPerKm);
  const secs = Math.round((paceMinPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return km % 1 === 0 ? `${km}km` : `${km.toFixed(1)}km`;
  }
  return `${meters}m`;
}

export function PaceCurvesWidget({ data: propData, onActivitySelect }: PaceCurvesWidgetProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left?: number; right?: number } | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindowOption>(TIME_WINDOWS[4]); // Default to "All"
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const apiKey = useAtomValue(apiKeyAtom);
  const { data: fetchedData, isLoading } = usePaceCurves(apiKey, timeWindow.curveId);

  const data = fetchedData ?? propData;
  if (!data) {
    return isLoading ? (
      <div className="text-[#b8a5d4] text-sm">Loading pace curves...</div>
    ) : null;
  }

  const { bestEfforts, longestRun, curve: rawCurve } = data;

  // Filter curve to start at 1km (ignore sub-1km data points)
  const curve = rawCurve.filter((p) => p.distance >= 1000);

  // Chart dimensions
  const width = 600;
  const height = 180;
  const padding = { top: 20, right: 20, bottom: 35, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // X-axis: linear scale starting at 1km
  const minDist = 1000;
  const maxDist = curve.length > 0 ? curve[curve.length - 1].distance : 10000;

  // Y-axis: fixed scale (4:00 to 8:00 min/km) for consistent comparison
  const yMin = 4.0;
  const yMax = 8.0;

  const scaleX = (d: number) =>
    padding.left + ((d - minDist) / (maxDist - minDist)) * chartWidth;

  const scaleY = (p: number) =>
    padding.top + ((p - yMin) / (yMax - yMin)) * chartHeight;

  // Build SVG path
  const pathD = curve
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${scaleX(pt.distance)} ${scaleY(pt.pace)}`)
    .join(" ");

  // X-axis ticks: every 1km
  const xTickValues: number[] = [];
  for (let km = 1; km * 1000 <= maxDist; km++) {
    xTickValues.push(km * 1000);
  }

  // Y-axis ticks
  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => {
    const p = yMin + (i / (yTickCount - 1)) * (yMax - yMin);
    return { p, y: scaleY(p), label: formatPace(p) };
  });

  // Hover handling
  const getIdxFromPosition = (clientX: number): number | null => {
    if (!svgRef.current || curve.length === 0) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const svgX = (x / rect.width) * width;
    if (svgX < padding.left || svgX > width - padding.right) return null;

    // Reverse the linear scale to find distance
    const frac = (svgX - padding.left) / chartWidth;
    const targetDist = minDist + frac * (maxDist - minDist);

    // Find closest curve point
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < curve.length; i++) {
      const diff = Math.abs(curve[i].distance - targetDist);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  const updateTooltipPos = (clientX: number) => {
    if (!wrapperRef.current) return;
    const r = wrapperRef.current.getBoundingClientRect();
    const x = clientX - r.left;
    const mid = r.width / 2;
    setTooltipPos(x < mid ? { left: x + 12 } : { right: r.width - x + 12 });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    setHoverIdx(getIdxFromPosition(e.clientX));
    updateTooltipPos(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length > 0) {
      setHoverIdx(getIdxFromPosition(e.touches[0].clientX));
      updateTooltipPos(e.touches[0].clientX);
    }
  };

  const handleLeave = () => {
    setHoverIdx(null);
    setTooltipPos(null);
  };

  const hoverPoint = hoverIdx !== null ? curve[hoverIdx] : null;

  const handleCardClick = (activityId?: string) => {
    if (activityId && onActivitySelect) {
      onActivitySelect(activityId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Best Efforts Grid */}
      <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {bestEfforts.map((effort) => (
            <div
              key={effort.label}
              className={`bg-[#2a1f3d] rounded-lg p-3 ${effort.activityId && onActivitySelect ? "cursor-pointer active:bg-[#3d2b5a] transition-colors" : ""}`}
              onClick={() => { handleCardClick(effort.activityId); }}
            >
              <div className="text-xs text-[#b8a5d4] uppercase">{effort.label}</div>
              <div className="text-lg font-bold text-white">
                {formatTime(effort.timeSeconds)}
              </div>
              <div className="text-xs text-[#8b7ba8]">
                {formatPace(effort.pace)}/km
              </div>
            </div>
          ))}
          {longestRun && (
            <div
              className={`bg-[#2a1f3d] rounded-lg p-3 ${onActivitySelect ? "cursor-pointer active:bg-[#3d2b5a] transition-colors" : ""}`}
              onClick={() => { handleCardClick(longestRun.activityId); }}
            >
              <div className="text-xs text-[#b8a5d4] uppercase">Longest Run</div>
              <div className="text-lg font-bold text-white">
                {formatDistance(longestRun.distance)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pace Curve Chart */}
      {curve.length > 0 && (
        <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4">
          {/* Time Window Selector */}
          <div className="flex gap-1 mb-3">
            {TIME_WINDOWS.map((tw) => (
              <button
                key={tw.label}
                onClick={() => { setTimeWindow(tw); }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  timeWindow.label === tw.label
                    ? "bg-[#3d2b5a] text-white"
                    : "text-[#8b7ba8] hover:text-white"
                }`}
              >
                {tw.label}
              </button>
            ))}
            {isLoading && (
              <span className="text-xs text-[#8b7ba8] ml-2 self-center">Loading...</span>
            )}
          </div>
          <div ref={wrapperRef} className="relative">
            {hoverPoint && tooltipPos && (
              <div
                className="absolute top-2 z-10 bg-[#1e1535] border border-[#3d2b5a] rounded-lg px-3 py-2 text-xs pointer-events-none"
                style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.4)", ...tooltipPos }}
              >
                <div className="text-[#b8a5d4] font-medium">
                  {formatDistance(hoverPoint.distance)}
                </div>
                <div className="text-white font-bold">
                  {formatPace(hoverPoint.pace)}/km
                </div>
              </div>
            )}
            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${height}`}
              className="w-full cursor-crosshair"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleLeave}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleLeave}
              style={{ touchAction: "none" }}
            >
              {/* Grid lines */}
              {yTicks.map((tick, i) => (
                <line
                  key={i}
                  x1={padding.left}
                  y1={tick.y}
                  x2={width - padding.right}
                  y2={tick.y}
                  stroke="#3d2b5a"
                  strokeWidth="1"
                />
              ))}

              {/* Y-axis labels */}
              {yTicks.map((tick, i) => (
                <text
                  key={i}
                  x={padding.left - 6}
                  y={tick.y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#b8a5d4"
                >
                  {tick.label}
                </text>
              ))}

              {/* X-axis labels */}
              {xTickValues.map((d) => (
                <text
                  key={d}
                  x={scaleX(d)}
                  y={height - padding.bottom + 16}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#b8a5d4"
                >
                  {formatDistance(d)}
                </text>
              ))}

              {/* Pace curve line */}
              <path
                d={pathD}
                fill="none"
                stroke="#00ffff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Hover crosshair */}
              {hoverIdx !== null && hoverPoint && (
                <>
                  <line
                    x1={scaleX(hoverPoint.distance)}
                    y1={padding.top}
                    x2={scaleX(hoverPoint.distance)}
                    y2={height - padding.bottom}
                    stroke="#b8a5d4"
                    strokeWidth="1"
                    strokeDasharray="4 2"
                    opacity="0.5"
                  />
                  <circle
                    cx={scaleX(hoverPoint.distance)}
                    cy={scaleY(hoverPoint.pace)}
                    r="5"
                    fill="#00ffff"
                    stroke="#0d0a1a"
                    strokeWidth="2"
                  />
                </>
              )}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
