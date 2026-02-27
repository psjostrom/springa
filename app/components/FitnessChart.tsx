"use client";

import { useState, useRef } from "react";
import type { FitnessDataPoint } from "@/lib/fitness";

interface FitnessChartProps {
  data: FitnessDataPoint[];
}

type VisibleLine = "ctl" | "atl" | "tsb";

const LINE_CONFIGS: Record<
  VisibleLine,
  { label: string; color: string; unit: string }
> = {
  ctl: { label: "Fitness", color: "#00ffff", unit: "" },
  atl: { label: "Fatigue", color: "#c4b5fd", unit: "" },
  tsb: { label: "Form", color: "#39ff14", unit: "" },
};

export function FitnessChart({ data }: FitnessChartProps) {
  const [visibleLines, setVisibleLines] = useState<Set<VisibleLine>>(
    new Set(["ctl", "atl", "tsb"]),
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left?: number; right?: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  if (data.length === 0) return null;

  const toggleLine = (line: VisibleLine) => {
    setVisibleLines((prev) => {
      const next = new Set(prev);
      if (next.has(line)) {
        if (next.size === 1) return next; // keep at least one
        next.delete(line);
      } else {
        next.add(line);
      }
      return next;
    });
  };

  // Chart dimensions
  const width = 600;
  const height = 220;
  const padding = { top: 20, right: 15, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Compute Y range across all visible lines
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const dp of data) {
    for (const line of visibleLines) {
      const v = dp[line];
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  // Add padding
  const yRange = yMax - yMin || 1;
  yMin -= yRange * 0.1;
  yMax += yRange * 0.1;

  const scaleX = (i: number) =>
    padding.left + (i / (data.length - 1)) * chartWidth;
  const scaleY = (v: number) =>
    padding.top + (1 - (v - yMin) / (yMax - yMin)) * chartHeight;

  // Build SVG paths
  const paths: { line: VisibleLine; d: string }[] = [];
  for (const line of visibleLines) {
    const d = data
      .map((dp, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(dp[line])}`)
      .join(" ");
    paths.push({ line, d });
  }

  // Form zone bands (drawn as rects behind the lines)
  const zeroY = scaleY(0);

  // Hover
  const getIdxFromPosition = (clientX: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const svgX = (x / rect.width) * width;
    if (svgX < padding.left || svgX > width - padding.right) return null;
    const frac = (svgX - padding.left) / chartWidth;
    return Math.round(frac * (data.length - 1));
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

  const handleLeave = () => { setHoverIdx(null); setTooltipPos(null); };

  // X-axis labels — show ~6 ticks
  const tickCount = 6;
  const xTicks = Array.from({ length: tickCount }, (_, i) => {
    const idx = Math.round((i / (tickCount - 1)) * (data.length - 1));
    return { idx, label: data[idx]?.date.slice(5) }; // MM-DD
  });

  // Y-axis labels
  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => {
    const v = yMin + (i / (yTickCount - 1)) * (yMax - yMin);
    return { v, y: scaleY(v), label: Math.round(v).toString() };
  });

  const hoverData = hoverIdx !== null ? data[hoverIdx] : null;


  return (
    <div>
      {/* Toggle buttons */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {(Object.keys(LINE_CONFIGS) as VisibleLine[]).map((line) => {
          const cfg = LINE_CONFIGS[line];
          const active = visibleLines.has(line);
          return (
            <button
              key={line}
              onClick={() => { toggleLine(line); }}
              aria-pressed={active}
              aria-label={`Toggle ${cfg.label}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                active
                  ? "bg-[#2a1f3d] text-white border border-[#3d2b5a]"
                  : "bg-[#1a1030] text-[#b8a5d4] hover:bg-[#2a1f3d] border border-transparent"
              }`}
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: active ? cfg.color : "#3d2b5a" }}
              />
              {cfg.label}
            </button>
          );
        })}
      </div>

      <div ref={wrapperRef} className="relative">
        {hoverData && tooltipPos && (
          <div
            className="absolute top-2 z-10 bg-[#1e1535] border border-[#3d2b5a] rounded-lg px-3 py-2 text-xs sm:text-sm pointer-events-none"
            style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.4)", ...tooltipPos }}
          >
            <div className="text-[#b8a5d4] font-medium mb-1">{hoverData.date}</div>
            {(["ctl", "atl", "tsb"] as VisibleLine[]).filter(l => visibleLines.has(l)).map(line => (
              <div key={line} className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: LINE_CONFIGS[line].color }} />
                <span className="text-[#b8a5d4]">{LINE_CONFIGS[line].label}</span>
                <span className="font-bold text-white ml-auto">{hoverData[line]}</span>
              </div>
            ))}
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

        {/* Zero line (if visible) */}
        {yMin < 0 && yMax > 0 && (
          <line
            x1={padding.left}
            y1={zeroY}
            x2={width - padding.right}
            y2={zeroY}
            stroke="#b8a5d4"
            strokeWidth="1"
            strokeDasharray="4 2"
          />
        )}

        {/* Form zone shading (behind TSB line) */}
        {visibleLines.has("tsb") && yMin < 0 && yMax > 0 && (
          <>
            {/* Negative zone (training stress) */}
            <rect
              x={padding.left}
              y={zeroY}
              width={chartWidth}
              height={Math.min(
                scaleY(yMin) - zeroY,
                height - padding.bottom - zeroY,
              )}
              fill="#ff2d95"
              opacity="0.05"
            />
            {/* Positive zone (freshness) */}
            <rect
              x={padding.left}
              y={Math.max(padding.top, scaleY(yMax))}
              width={chartWidth}
              height={zeroY - Math.max(padding.top, scaleY(yMax))}
              fill="#39ff14"
              opacity="0.05"
            />
          </>
        )}

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
        {xTicks.map((tick, i) => (
          <text
            key={i}
            x={scaleX(tick.idx)}
            y={height - padding.bottom + 16}
            textAnchor="middle"
            fontSize="11"
            fill="#b8a5d4"
          >
            {tick.label}
          </text>
        ))}

        {/* Data lines */}
        {paths.map(({ line, d }) => (
          <path
            key={line}
            d={d}
            fill="none"
            stroke={LINE_CONFIGS[line].color}
            strokeWidth={line === "ctl" ? 2.5 : 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={line === "tsb" ? 0.7 : 0.9}
          />
        ))}

        {/* Hover crosshair + tooltip */}
        {hoverIdx !== null && hoverData && (
          <>
            <line
              x1={scaleX(hoverIdx)}
              y1={padding.top}
              x2={scaleX(hoverIdx)}
              y2={height - padding.bottom}
              stroke="#b8a5d4"
              strokeWidth="1"
              strokeDasharray="4 2"
              opacity="0.5"
            />
            {paths.map(({ line }) => {
              const dp = data[hoverIdx];
              return (
                <circle
                  key={line}
                  cx={scaleX(hoverIdx)}
                  cy={scaleY(dp[line])}
                  r="4"
                  fill={LINE_CONFIGS[line].color}
                  stroke="#0d0a1a"
                  strokeWidth="2"
                />
              );
            })}
          </>
        )}
      </svg>
      </div>
    </div>
  );
}
