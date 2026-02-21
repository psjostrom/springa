"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import type { XdripReading } from "@/lib/xdrip";
import { trendArrow } from "@/lib/xdrip";
import { bgColor } from "./CurrentBGPill";

interface BGGraphPopoverProps {
  readings: XdripReading[];
  trend: string | null;
  onClose: () => void;
}

const WIDTH = 400;
const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };
const CHART_W = WIDTH - PAD.left - PAD.right;
const CHART_H = HEIGHT - PAD.top - PAD.bottom;

// Target BG range
const TARGET_LOW = 3.9;
const TARGET_HIGH = 10.0;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function BGGraphPopover({ readings, trend, onClose }: BGGraphPopoverProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const [now] = useState(() => Date.now());
  const svgRef = useRef<SVGSVGElement>(null);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 250);
  }, [onClose]);

  // Filter to last 3 hours
  const data = useMemo(() => {
    const cutoff = now - 3 * 60 * 60 * 1000;
    return readings.filter((r) => r.ts >= cutoff).sort((a, b) => a.ts - b.ts);
  }, [readings, now]);

  if (data.length === 0) return null;

  // Y-axis bounds
  const mmolValues = data.map((r) => r.mmol);
  const dataMin = Math.min(...mmolValues);
  const dataMax = Math.max(...mmolValues);
  const yMin = Math.min(2.0, dataMin - 0.5);
  const yMax = Math.max(20.0, dataMax + 0.5);

  // X-axis bounds
  const tMin = data[0].ts;
  const tMax = data[data.length - 1].ts;
  const tRange = tMax - tMin || 1;

  const scaleX = (ts: number) => PAD.left + ((ts - tMin) / tRange) * CHART_W;
  const scaleY = (mmol: number) => PAD.top + ((yMax - mmol) / (yMax - yMin)) * CHART_H;

  // Build path
  const pathD = data
    .map((r, i) => `${i === 0 ? "M" : "L"} ${scaleX(r.ts).toFixed(1)} ${scaleY(r.mmol).toFixed(1)}`)
    .join(" ");

  // X-axis hour ticks
  const hourTicks: number[] = [];
  {
    const firstHour = new Date(tMin);
    firstHour.setMinutes(0, 0, 0);
    let t = firstHour.getTime() + 60 * 60 * 1000; // next whole hour
    while (t < tMax) {
      if (t > tMin) hourTicks.push(t);
      t += 60 * 60 * 1000;
    }
  }

  // Y-axis mmol ticks
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin); v <= Math.floor(yMax); v += 2) {
    yTicks.push(v);
  }

  // Scrub interaction
  const getReadingFromPosition = (clientX: number): number | null => {
    if (!svgRef.current || data.length === 0) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const svgX = (x / rect.width) * WIDTH;
    if (svgX < PAD.left || svgX > WIDTH - PAD.right) return null;
    const normalizedT = ((svgX - PAD.left) / CHART_W) * tRange + tMin;
    // Find closest reading
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < data.length; i++) {
      const dist = Math.abs(data[i].ts - normalizedT);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  };

  const handlePointerMove = (clientX: number) => {
    const idx = getReadingFromPosition(clientX);
    setScrubIdx(idx);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => handlePointerMove(e.clientX);
  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length > 0) handlePointerMove(e.touches[0].clientX);
  };
  const handlePointerEnd = () => setScrubIdx(null);

  const scrubReading = scrubIdx !== null ? data[scrubIdx] : null;

  // Delta + age for current view (scrubbed or live)
  const activeIdx = scrubIdx ?? data.length - 1;
  const activeReading = data[activeIdx];
  const prevReading = activeIdx > 0 ? data[activeIdx - 1] : null;
  const delta = prevReading ? activeReading.mmol - prevReading.mmol : null;
  const ageMs = now - activeReading.ts;
  const ageMins = Math.floor(ageMs / 60000);
  const ageStr = scrubReading
    ? formatTime(scrubReading.ts)
    : ageMins < 1
      ? "now"
      : ageMins < 60
        ? `${ageMins}m ago`
        : `${Math.floor(ageMins / 60)}h ${ageMins % 60}m ago`;

  const displayMmol = activeReading.mmol;
  const color = bgColor(displayMmol);

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
          <div className="flex items-baseline gap-2">
            <span
              className="text-3xl font-bold"
              style={{ color, textShadow: `0 0 12px ${color}60` }}
            >
              {displayMmol.toFixed(1)}
            </span>
            <span className="text-xl" style={{ color }}>
              {scrubReading ? trendArrow(scrubReading.direction) : trend}
            </span>
            {delta !== null && (
              <span className="text-sm font-semibold" style={{ color: delta > 0 ? "#fbbf24" : delta < -0.3 ? "#ff3366" : "#39ff14" }}>
                {delta > 0 ? "+" : ""}{delta.toFixed(1)}
              </span>
            )}
            <span className="text-sm text-[#b8a5d4]">{ageStr}</span>
          </div>
          <span className="text-xs text-[#b8a5d4] font-medium px-2 py-0.5 rounded bg-[#1e1535]">3h</span>
        </div>

        {/* Graph */}
        <div className="px-2 pb-4">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full touch-none select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={handlePointerEnd}
            onTouchMove={handleTouchMove}
            onTouchEnd={handlePointerEnd}
          >
            <defs>
              {/* Neon glow filter — 3 layers */}
              <filter id="bg-glow-wide" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feFlood floodColor="#00ffff" floodOpacity="0.3" />
                <feComposite in2="blur" operator="in" />
              </filter>
              <filter id="bg-glow-mid" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feFlood floodColor="#00ffff" floodOpacity="0.5" />
                <feComposite in2="blur" operator="in" />
              </filter>
            </defs>

            {/* Target range band */}
            <rect
              x={PAD.left}
              y={scaleY(TARGET_HIGH)}
              width={CHART_W}
              height={scaleY(TARGET_LOW) - scaleY(TARGET_HIGH)}
              fill="#39ff1410"
            />
            {/* Dashed borders for target range */}
            <line
              x1={PAD.left} y1={scaleY(TARGET_HIGH)}
              x2={WIDTH - PAD.right} y2={scaleY(TARGET_HIGH)}
              stroke="#39ff1430" strokeDasharray="4 3" strokeWidth={0.5}
            />
            <line
              x1={PAD.left} y1={scaleY(TARGET_LOW)}
              x2={WIDTH - PAD.right} y2={scaleY(TARGET_LOW)}
              stroke="#39ff1430" strokeDasharray="4 3" strokeWidth={0.5}
            />

            {/* Low danger zone */}
            <rect
              x={PAD.left}
              y={scaleY(TARGET_LOW)}
              width={CHART_W}
              height={scaleY(yMin) - scaleY(TARGET_LOW)}
              fill="#ff336610"
            />

            {/* Y-axis ticks */}
            {yTicks.map((v) => (
              <g key={v}>
                <line
                  x1={PAD.left} y1={scaleY(v)}
                  x2={WIDTH - PAD.right} y2={scaleY(v)}
                  stroke="#ffffff08" strokeWidth={0.5}
                />
                <text
                  x={PAD.left - 4} y={scaleY(v) + 3}
                  textAnchor="end" fill="#b8a5d4" fontSize={9} opacity={0.6}
                >
                  {v}
                </text>
              </g>
            ))}

            {/* X-axis hour ticks */}
            {hourTicks.map((t) => (
              <g key={t}>
                <line
                  x1={scaleX(t)} y1={PAD.top}
                  x2={scaleX(t)} y2={HEIGHT - PAD.bottom}
                  stroke="#ffffff08" strokeWidth={0.5}
                />
                <text
                  x={scaleX(t)} y={HEIGHT - PAD.bottom + 14}
                  textAnchor="middle" fill="#b8a5d4" fontSize={9} opacity={0.6}
                >
                  {formatTime(t)}
                </text>
              </g>
            ))}

            {/* Glow layers */}
            <path d={pathD} fill="none" stroke="#00ffff" strokeWidth={4} filter="url(#bg-glow-wide)" opacity={0.4} />
            <path d={pathD} fill="none" stroke="#00ffff" strokeWidth={2.5} filter="url(#bg-glow-mid)" opacity={0.6} />
            {/* Core line */}
            <path d={pathD} fill="none" stroke="#00ffff" strokeWidth={1.5} strokeLinejoin="round" />

            {/* Dots */}
            {data.map((r, i) => (
              <circle
                key={i}
                cx={scaleX(r.ts)}
                cy={scaleY(r.mmol)}
                r={2.5}
                fill={bgColor(r.mmol)}
                opacity={0.9}
              />
            ))}

            {/* Scrub line + tooltip */}
            {scrubReading && (
              <>
                <line
                  x1={scaleX(scrubReading.ts)} y1={PAD.top}
                  x2={scaleX(scrubReading.ts)} y2={HEIGHT - PAD.bottom}
                  stroke="#ffffff40" strokeWidth={1} strokeDasharray="3 2"
                />
                <circle
                  cx={scaleX(scrubReading.ts)}
                  cy={scaleY(scrubReading.mmol)}
                  r={5}
                  fill={bgColor(scrubReading.mmol)}
                  stroke="#0d0a1a"
                  strokeWidth={2}
                />
              </>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
