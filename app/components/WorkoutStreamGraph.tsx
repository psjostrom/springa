"use client";

import { useState, useRef } from "react";
import type { StreamData } from "@/lib/types";

interface WorkoutStreamGraphProps {
  streamData: StreamData;
}

type StreamType =
  | "glucose"
  | "heartrate"
  | "pace"
  | "cadence"
  | "altitude";

interface StreamConfig {
  label: string;
  unit: string;
  color: string;
  strokeWidth?: number;
  targetRange?: { min: number; max: number; color: string };
  invertYAxis?: boolean;
  formatValue?: (value: number) => string;
}

const streamConfigs: Record<StreamType, StreamConfig> = {
  glucose: {
    label: "Blood Glucose",
    unit: "mmol/L",
    color: "#c4b5fd",
    strokeWidth: 3,
    targetRange: { min: 3.9, max: 10.0, color: "#1a3d25" },
  },
  heartrate: {
    label: "Heart Rate",
    unit: "bpm",
    color: "#ff3366",
    strokeWidth: 2,
  },
  pace: {
    label: "Pace",
    unit: "min/km",
    color: "#00ffff",
    strokeWidth: 2,
    invertYAxis: true,
    formatValue: (value: number) => {
      const mins = Math.floor(value);
      const secs = Math.round((value % 1) * 60);
      return `${mins}:${String(secs).padStart(2, "0")}`;
    },
  },
  cadence: {
    label: "Cadence",
    unit: "spm",
    color: "#ffb800",
    strokeWidth: 2,
  },
  altitude: {
    label: "Elevation",
    unit: "m",
    color: "#39ff14",
    strokeWidth: 2,
  },
};

export function WorkoutStreamGraph({ streamData }: WorkoutStreamGraphProps) {
  const availableStreams = Object.keys(streamData).filter(
    (key) => streamData[key as StreamType],
  ) as StreamType[];

  // Default selections: glucose + heartrate, or first two available
  const getDefaultSelections = () => {
    if (availableStreams.includes("glucose")) {
      return ["glucose", "heartrate"].filter((s) =>
        availableStreams.includes(s as StreamType),
      ) as StreamType[];
    }
    return availableStreams.slice(0, 2);
  };

  const [selectedStreams, setSelectedStreams] = useState<StreamType[]>(
    getDefaultSelections(),
  );

  // Hover/scrub state
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  if (availableStreams.length === 0) return null;

  const toggleStream = (stream: StreamType) => {
    setSelectedStreams((prev) => {
      if (prev.includes(stream)) {
        // Don't allow deselecting all streams
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== stream);
      }
      return [...prev, stream];
    });
  };

  const width = 400;
  const height = 180;
  const padding = { top: 25, right: 10, bottom: 30, left: 35 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Get max time from any selected stream
  const maxTime = Math.max(
    ...selectedStreams.map((stream) => {
      const data = streamData[stream];
      return data ? Math.max(...data.map((d) => d.time)) : 0;
    }),
  );

  // Calculate time from mouse/touch position
  const getTimeFromPosition = (clientX: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const svgX = (x / rect.width) * width;

    // Check if within chart bounds
    if (svgX < padding.left || svgX > width - padding.right) return null;

    const normalizedX = (svgX - padding.left) / chartWidth;
    return normalizedX * maxTime;
  };

  // Mouse/touch event handlers
  const handlePointerMove = (clientX: number) => {
    const time = getTimeFromPosition(clientX);
    setHoverTime(time);
    setIsHovering(time !== null);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    handlePointerMove(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length > 0) {
      handlePointerMove(e.touches[0].clientX);
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setHoverTime(null);
  };

  const handleTouchEnd = () => {
    setIsHovering(false);
    setHoverTime(null);
  };

  // Determine if we should use actual values (single stream) or normalized (multiple)
  const useSingleStreamMode = selectedStreams.length === 1;

  // Calculate global min/max for single stream mode
  let globalMin = 0;
  let globalMax = 100;
  if (useSingleStreamMode && selectedStreams.length > 0) {
    const data = streamData[selectedStreams[0]];
    if (data && data.length > 0) {
      const values = data.map((d) => d.value);
      globalMin = Math.min(...values);
      globalMax = Math.max(...values);
      // Add padding to the range
      const paddingRange = (globalMax - globalMin) * 0.1;
      globalMin = Math.max(0, globalMin - paddingRange);
      globalMax = globalMax + paddingRange;
    }
  }

  // Normalize each stream to 0-100% scale (or actual values for single stream) and create paths
  const streamPaths = selectedStreams
    .map((streamType) => {
      const data = streamData[streamType];
      if (!data || data.length === 0) return null;

      const config = streamConfigs[streamType];
      const values = data.map((d) => d.value);
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);

      const scaleX = (time: number) =>
        (time / maxTime) * chartWidth + padding.left;

      const scaleY = (value: number) => {
        if (useSingleStreamMode) {
          // Use actual values
          const normalized = (value - globalMin) / (globalMax - globalMin);
          const finalNormalized = config.invertYAxis ? 1 - normalized : normalized;
          return height - padding.bottom - finalNormalized * chartHeight;
        } else {
          // Scale to 0-100%
          const normalized = (value - minValue) / (maxValue - minValue);
          const finalNormalized = config.invertYAxis ? 1 - normalized : normalized;
          return height - padding.bottom - finalNormalized * chartHeight;
        }
      };

      const pathData = data
        .map((d, i) => {
          const x = scaleX(d.time);
          const y = scaleY(d.value);
          return `${i === 0 ? "M" : "L"} ${x} ${y}`;
        })
        .join(" ");

      // Find value at hover time
      let hoverValue = null;
      let hoverY = null;
      if (hoverTime !== null) {
        // Find closest data point
        const closest = data.reduce((prev, curr) => {
          return Math.abs(curr.time - hoverTime) <
            Math.abs(prev.time - hoverTime)
            ? curr
            : prev;
        });
        hoverValue = closest.value;
        hoverY = scaleY(closest.value);
      }

      return {
        streamType,
        pathData,
        config,
        minValue,
        maxValue,
        data,
        hoverValue,
        hoverY,
      };
    })
    .filter(Boolean);

  return (
    <div className="w-full">
      {/* Stream selector */}
      <div className="flex gap-1.5 sm:gap-2 mb-3 flex-wrap">
        {availableStreams.map((stream) => {
          const config = streamConfigs[stream];
          const isSelected = selectedStreams.includes(stream);
          return (
            <button
              key={stream}
              onClick={() => toggleStream(stream)}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 sm:gap-2 ${
                isSelected
                  ? "bg-[#2a1f3d] text-white border border-[#3d2b5a]"
                  : "bg-[#1a1030] text-[#b8a5d4] hover:bg-[#2a1f3d] border border-transparent"
              }`}
            >
              <div
                className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full"
                style={{
                  backgroundColor: isSelected ? config.color : "#3d2b5a",
                }}
              />
              <span className="hidden sm:inline">{config.label}</span>
              <span className="sm:hidden">{config.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Legend showing current ranges or hover values */}
      <div className="flex gap-2 sm:gap-4 mb-3 text-sm flex-wrap min-h-[2.5rem]">
        {streamPaths.map((path, idx) => {
          if (!path) return null;
          const { config, minValue, maxValue, hoverValue } = path;
          const formatVal = config.formatValue || ((v: number) => v.toFixed(1));
          return (
            <div key={idx} className="flex items-center gap-1 sm:gap-2">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: config.color }}
              />
              <span
                className="font-medium text-sm"
                style={{ color: config.color }}
              >
                {config.label}:
              </span>
              <span className="text-[#c4b5fd] text-sm whitespace-nowrap font-semibold">
                {isHovering && hoverValue !== null
                  ? `${formatVal(hoverValue)} ${config.unit}`
                  : `${formatVal(minValue)} - ${formatVal(maxValue)} ${config.unit}`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Graph */}
      <div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: "none" }}
        >
          {/* Grid lines */}
          {Array.from({ length: 5 }).map((_, i) => {
            const yPercent = i / 4;
            const y = height - padding.bottom - yPercent * chartHeight;
            return (
              <line
                key={i}
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#3d2b5a"
                strokeWidth="1"
              />
            );
          })}

          {/* Y-axis labels */}
          {Array.from({ length: 5 }).map((_, i) => {
            const yPercent = i / 4;
            const y = height - padding.bottom - yPercent * chartHeight;

            let label = "";
            if (useSingleStreamMode && streamPaths.length > 0) {
              // Show actual values
              const actualValue = globalMin + yPercent * (globalMax - globalMin);
              const config = streamPaths[0]?.config;
              if (config?.formatValue) {
                label = config.formatValue(actualValue);
              } else {
                label = actualValue.toFixed(1);
              }
            } else {
              // Show percentages
              label = `${Math.round(yPercent * 100)}%`;
            }

            return (
              <text
                key={i}
                x={padding.left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#b8a5d4"
              >
                {label}
              </text>
            );
          })}

          {/* Data lines */}
          {streamPaths.map((path, idx) => {
            if (!path) return null;
            return (
              <path
                key={idx}
                d={path.pathData}
                fill="none"
                stroke={path.config.color}
                strokeWidth={path.config.strokeWidth || 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
            );
          })}

          {/* Hover line and dots */}
          {isHovering && hoverTime !== null && (
            <>
              {/* Vertical line */}
              <line
                x1={(hoverTime / maxTime) * chartWidth + padding.left}
                y1={padding.top}
                x2={(hoverTime / maxTime) * chartWidth + padding.left}
                y2={height - padding.bottom}
                stroke="#b8a5d4"
                strokeWidth="1"
                strokeDasharray="4 2"
                opacity="0.6"
              />
              {/* Dots on each line */}
              {streamPaths.map((path, idx) => {
                if (!path || path.hoverY === null) return null;
                return (
                  <circle
                    key={idx}
                    cx={(hoverTime / maxTime) * chartWidth + padding.left}
                    cy={path.hoverY}
                    r="4"
                    fill={path.config.color}
                    stroke="#0d0a1a"
                    strokeWidth="2"
                  />
                );
              })}
              {/* Time label */}
              <text
                x={(hoverTime / maxTime) * chartWidth + padding.left}
                y={padding.top - 5}
                textAnchor="middle"
                fontSize="11"
                fill="#c4b5fd"
                fontWeight="600"
              >
                {Math.round(hoverTime)}m
              </text>
            </>
          )}

          {/* X-axis tick labels */}
          {[0, 0.5, 1].map((frac) => (
            <text
              key={frac}
              x={padding.left + frac * chartWidth}
              y={height - padding.bottom + 14}
              textAnchor="middle"
              fontSize="11"
              fill="#b8a5d4"
            >
              {Math.round(frac * maxTime)}m
            </text>
          ))}

          {/* Y-axis label - only show when single stream */}
          {useSingleStreamMode && streamPaths.length > 0 && (
            <text
              x={10}
              y={height / 2}
              textAnchor="middle"
              fontSize="12"
              fill="#b8a5d4"
              fontWeight="500"
              transform={`rotate(-90, 10, ${height / 2})`}
            >
              {streamPaths[0]?.config.unit}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
