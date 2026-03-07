"use client";

import { useState, useRef } from "react";
import type { PaceCurveData } from "@/lib/types";

interface PaceCurvesWidgetProps {
  data: PaceCurveData;
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

export function PaceCurvesWidget({ data }: PaceCurvesWidgetProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left?: number; right?: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { bestEfforts, longestRun, curve } = data;

  // Chart dimensions
  const width = 600;
  const height = 180;
  const padding = { top: 20, right: 20, bottom: 35, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Use log scale for distance (X), linear for pace (Y)
  const minDist = curve.length > 0 ? Math.max(curve[0].distance, 100) : 100;
  const maxDist = curve.length > 0 ? curve[curve.length - 1].distance : 10000;

  const paces = curve.map((p) => p.pace);
  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);
  const paceRange = maxPace - minPace || 1;
  const yMin = minPace - paceRange * 0.1;
  const yMax = maxPace + paceRange * 0.1;

  const scaleX = (d: number) => {
    const logMin = Math.log10(minDist);
    const logMax = Math.log10(maxDist);
    const logD = Math.log10(Math.max(d, minDist));
    return padding.left + ((logD - logMin) / (logMax - logMin)) * chartWidth;
  };

  const scaleY = (p: number) =>
    padding.top + ((p - yMin) / (yMax - yMin)) * chartHeight;

  // Build SVG path
  const pathD = curve
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${scaleX(pt.distance)} ${scaleY(pt.pace)}`)
    .join(" ");

  // X-axis ticks (log scale: 1km, 5km, 10km, etc.)
  const xTickValues = [1000, 2000, 5000, 10000, 20000, 42195].filter(
    (d) => d >= minDist && d <= maxDist
  );

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

    // Reverse the log scale to find distance
    const logMin = Math.log10(minDist);
    const logMax = Math.log10(maxDist);
    const frac = (svgX - padding.left) / chartWidth;
    const logD = logMin + frac * (logMax - logMin);
    const targetDist = Math.pow(10, logD);

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

  return (
    <div className="space-y-4">
      {/* Best Efforts Grid */}
      <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4">
        <div className="text-xs font-semibold uppercase text-[#b8a5d4] mb-3">
          Personal Bests
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {bestEfforts.map((effort) => (
            <div key={effort.label} className="bg-[#2a1f3d] rounded-lg p-3">
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
            <div className="bg-[#2a1f3d] rounded-lg p-3">
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
          <div className="text-xs font-semibold uppercase text-[#b8a5d4] mb-3">
            Pace Curve
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
