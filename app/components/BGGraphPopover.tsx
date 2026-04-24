"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { trendArrow } from "@/lib/cgm";
import { bgColor } from "./CurrentBGPill";
import { getWorkoutCategory } from "@/lib/constants";
import { BG_HYPO, BG_STABLE_MAX } from "@/lib/constants";
import { readingsAtom, trendAtom, currentBGAtom, trendSlopeAtom, bgModelAtom, enrichedEventsAtom, settingsAtom, updateSettingsAtom, currentTsbAtom, currentIobAtom } from "../atoms";
import { PreRunReadiness } from "./PreRunReadiness";
import type { WorkoutCategory } from "@/lib/types";

interface BGGraphPopoverProps {
  onClose: () => void;
}

const WIDTH = 400;
const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };
const CHART_W = WIDTH - PAD.left - PAD.right;
const CHART_H = HEIGHT - PAD.top - PAD.bottom;
const NOW_REFRESH_INTERVAL_MS = 30_000;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function readinessCategoryForEvent(event: { category: "long" | "interval" | "easy" | "race" | "other"; name: string }): WorkoutCategory {
  if (event.category === "race") return "long";
  if (event.category === "long" || event.category === "interval" || event.category === "easy") return event.category;
  const byName = getWorkoutCategory(event.name);
  return byName === "other" ? "easy" : byName;
}

export function BGGraphPopover({ onClose }: BGGraphPopoverProps) {
  const readings = useAtomValue(readingsAtom);
  const trend = useAtomValue(trendAtom);
  const currentBG = useAtomValue(currentBGAtom);
  const trendSlope = useAtomValue(trendSlopeAtom);
  const bgModel = useAtomValue(bgModelAtom);
  const events = useAtomValue(enrichedEventsAtom);
  const settings = useAtomValue(settingsAtom);
  const updateSettings = useSetAtom(updateSettingsAtom);
  const currentTsb = useAtomValue(currentTsbAtom);
  const currentIob = useAtomValue(currentIobAtom);

  // Find today's upcoming workout (planned or race)
  const todaysWorkout = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return events.find(
      (e) => e.type !== "completed" && e.date >= today && e.date < tomorrow,
    ) ?? null;
  }, [events]);

  const todaysWorkoutCategory = useMemo(
    () => (todaysWorkout ? readinessCategoryForEvent(todaysWorkout) : null),
    [todaysWorkout],
  );

  const WINDOWS = [1, 3, 6, 12, 24] as const;
  const savedWindow = settings?.bgChartWindow;
  const initialIdx = savedWindow ? WINDOWS.indexOf(savedWindow as typeof WINDOWS[number]) : -1;
  const [windowIdx, setWindowIdx] = useState(initialIdx >= 0 ? initialIdx : 1);
  const [showWindowPicker, setShowWindowPicker] = useState(false);
  const windowHours = WINDOWS[windowIdx];

  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  useEffect(() => {
    const id = setInterval(() => { setNow(Date.now()); }, NOW_REFRESH_INTERVAL_MS);
    return () => { clearInterval(id); };
  }, []);

  // Filter to selected window
  const data = useMemo(() => {
    const cutoff = now - windowHours * 60 * 60 * 1000;
    return readings.filter((r) => r.ts >= cutoff).sort((a, b) => a.ts - b.ts);
  }, [readings, now, windowHours]);

  if (data.length === 0) return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-2xl sm:rounded-xl w-full sm:max-w-md shadow-xl shadow-glucose/10 border-t sm:border border-surface animate-slide-up px-4 py-8 text-center"
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); }}
      >
        <p className="text-muted text-sm">No BG data available</p>
      </div>
    </div>
  );

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

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => { handlePointerMove(e.clientX); };
  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length > 0) handlePointerMove(e.touches[0].clientX);
  };
  const handlePointerEnd = () => { setScrubIdx(null); };

  const scrubReading = scrubIdx !== null ? data[scrubIdx] : null;

  // Delta over 5 min, averaged at both endpoints to reduce single-reading noise
  const activeIdx = scrubIdx ?? data.length - 1;
  const activeReading = data[activeIdx];
  const DELTA_WINDOW_MS = 5 * 60 * 1000;
  const avgWindow = (centerIdx: number) => {
    const lo = Math.max(0, centerIdx - 1);
    const hi = Math.min(data.length - 1, centerIdx + 1);
    let sum = 0, count = 0;
    for (let i = lo; i <= hi; i++) { sum += data[i].mmol; count++; }
    return sum / count;
  };
  const targetTs = activeReading.ts - DELTA_WINDOW_MS;
  let pastIdx: number | null = null;
  for (let i = activeIdx - 1; i >= 0; i--) {
    if (data[i].ts <= targetTs) {
      const next = i + 1 < activeIdx ? i + 1 : null;
      pastIdx = next != null && Math.abs(data[next].ts - targetTs) < Math.abs(data[i].ts - targetTs) ? next : i;
      break;
    }
  }
  const delta = pastIdx !== null ? avgWindow(activeIdx) - avgWindow(pastIdx) : null;
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
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-2xl sm:rounded-xl w-full sm:max-w-md shadow-xl shadow-glucose/10 border-t sm:border border-surface animate-slide-up"
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); }}
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
              <span className="text-sm font-semibold" style={{ color: delta > 0 ? "var(--color-warning)" : delta < -0.3 ? "var(--color-error)" : "var(--color-success)" }}>
                {delta > 0 ? "+" : ""}{delta.toFixed(1)}
              </span>
            )}
            <span className="text-sm text-muted">{ageStr}</span>
          </div>
          <div className="relative">
            <button
              onClick={() => { setShowWindowPicker((v) => !v); }}
              className="text-xs text-muted font-medium px-2 py-0.5 rounded bg-surface hover:bg-border hover:text-glucose transition active:scale-95"
            >
              {windowHours}h
            </button>
            {showWindowPicker && (
              <div className="absolute right-0 top-full mt-1 flex gap-0.5 bg-surface border border-border rounded-lg p-0.5 shadow-lg shadow-black/40 z-10">
                {WINDOWS.map((w, i) => (
                  <button
                    key={w}
                    onClick={() => { setScrubIdx(null); setWindowIdx(i); setShowWindowPicker(false); void updateSettings({ bgChartWindow: w }); }}
                    className={`text-xs font-medium px-2.5 py-1 rounded transition ${
                      i === windowIdx
                        ? "bg-surface-alt text-glucose"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    {w}h
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Graph */}
        <div className="px-2 pb-2">
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
              <filter id="bg-blur" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>

            {/* Target range band */}
            <rect
              x={PAD.left}
              y={scaleY(BG_STABLE_MAX)}
              width={CHART_W}
              height={scaleY(BG_HYPO) - scaleY(BG_STABLE_MAX)}
              fill="#4ade8010"
            />
            {/* Dashed borders for target range */}
            <line
              x1={PAD.left} y1={scaleY(BG_STABLE_MAX)}
              x2={WIDTH - PAD.right} y2={scaleY(BG_STABLE_MAX)}
              stroke="#4ade8030" strokeDasharray="4 3" strokeWidth={0.5}
            />
            <line
              x1={PAD.left} y1={scaleY(BG_HYPO)}
              x2={WIDTH - PAD.right} y2={scaleY(BG_HYPO)}
              stroke="#4ade8030" strokeDasharray="4 3" strokeWidth={0.5}
            />

            {/* Low danger zone */}
            <rect
              x={PAD.left}
              y={scaleY(BG_HYPO)}
              width={CHART_W}
              height={scaleY(yMin) - scaleY(BG_HYPO)}
              fill="#ff4d6a10"
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
                  textAnchor="end" fill="var(--color-muted)" fontSize={9} opacity={0.6}
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
                  textAnchor="middle" fill="var(--color-muted)" fontSize={9} opacity={0.6}
                >
                  {formatTime(t)}
                </text>
              </g>
            ))}

            {/* BG line */}
            <path d={pathD} fill="none" stroke="var(--color-glucose)" strokeWidth={2.5} filter="url(#bg-blur)" opacity={0.3} />
            <path d={pathD} fill="none" stroke="var(--color-glucose)" strokeWidth={1.5} strokeLinejoin="round" />

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
                  stroke="var(--color-bg)"
                  strokeWidth={2}
                />
              </>
            )}
          </svg>
        </div>

        {/* Pre-run readiness — shown when there's a planned workout today */}
        {todaysWorkout && todaysWorkoutCategory && currentBG != null && (
          <div className="px-3 pb-4">
            <div className="text-xs text-muted uppercase tracking-wider font-semibold mb-1.5 px-1">
              {todaysWorkout.name}
            </div>
            <PreRunReadiness
              currentBG={currentBG}
              trendSlope={trendSlope}
              trend={trend}
              bgModel={bgModel}
              category={todaysWorkoutCategory}
              currentTsb={currentTsb}
              iob={currentIob}
            />
          </div>
        )}
      </div>
    </div>
  );
}
