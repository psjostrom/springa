"use client";

import { useState, useMemo } from "react";
import { useAtomValue } from "jotai";
import { AlertTriangle, TrendingDown, Zap, Timer } from "lucide-react";
import { simulateBG, type SimulationResult } from "@/lib/bgSimulation";
import { getCurrentFuelRate, getFuelConfidence } from "@/lib/fuelRate";
import type { WorkoutCategory } from "@/lib/types";
import { BGSimChart } from "../components/BGSimChart";
import { EmptyState } from "../components/EmptyState";
import { bgModelAtom, bgModelLoadingAtom } from "../atoms";

const CATEGORIES: { key: WorkoutCategory; label: string; color: string }[] = [
  { key: "easy", label: "Easy", color: "var(--color-chart-secondary)" },
  { key: "long", label: "Long", color: "var(--color-warning)" },
  { key: "interval", label: "Interval", color: "#fb923c" },
];

const FUEL_STEP = 4;
const snapToStep = (v: number) => Math.round(v / FUEL_STEP) * FUEL_STEP;

export function SimulateScreen() {
  const bgModel = useAtomValue(bgModelAtom);
  const bgModelLoading = useAtomValue(bgModelLoadingAtom);
  const [category, setCategory] = useState<WorkoutCategory>("easy");
  const [durationMin, setDurationMin] = useState(45);
  const [startBG, setStartBG] = useState(9.0);
  const [fuelOverride, setFuelOverride] = useState<number | null>(null);
  const modelFuelRate = snapToStep(getCurrentFuelRate(category, bgModel));
  const fuelRate = fuelOverride ?? modelFuelRate;
  const fuelConfidence = getFuelConfidence(category, bgModel);

  const result: SimulationResult | null = useMemo(() => {
    if (!bgModel || bgModel.activitiesAnalyzed === 0) return null;
    return simulateBG({
      startBG,
      entrySlope: null,
      segments: [{ durationMin, category }],
      fuelRateGH: fuelRate,
      bgModel,
    });
  }, [bgModel, category, durationMin, startBG, fuelRate]);

  if (bgModelLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        Loading BG model…
      </div>
    );
  }

  if (!bgModel || bgModel.activitiesAnalyzed === 0) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <EmptyState message="Complete a few runs with CGM data to unlock BG simulation">
          <svg width="100%" height="120" viewBox="0 0 300 120" className="text-muted">
            <path d="M10,80 Q40,40 80,60 T150,50 T220,70 T290,40" stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="10" y1="100" x2="290" y2="100" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
            <line x1="10" y1="20" x2="10" y2="100" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
          </svg>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-16 md:pb-4">
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <h2 className="text-lg font-semibold text-text">BG Simulation</h2>

        {/* Category selector */}
        <div className="flex gap-2">
          {CATEGORIES.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => { setCategory(key); setFuelOverride(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                category === key
                  ? "text-text shadow-lg"
                  : "text-muted bg-surface hover:bg-border"
              }`}
              style={
                category === key
                  ? { backgroundColor: color + "22", borderColor: color, border: `1px solid ${color}`, boxShadow: `0 0 12px ${color}44` }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted uppercase tracking-wider font-semibold flex items-center gap-1">
              <Timer size={12} /> Duration
            </span>
            <input
              type="range"
              min={15}
              max={120}
              step={5}
              value={durationMin}
              onChange={(e) => { setDurationMin(Number(e.target.value)); }}
              className="w-full accent-brand"
            />
            <span className="text-sm text-text">{durationMin} min</span>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-muted uppercase tracking-wider font-semibold flex items-center gap-1">
              <TrendingDown size={12} /> Start BG
            </span>
            <input
              type="range"
              min={4}
              max={16}
              step={0.5}
              value={startBG}
              onChange={(e) => { setStartBG(Number(e.target.value)); }}
              className="w-full accent-brand"
            />
            <span className="text-sm text-text">{startBG.toFixed(1)} mmol/L</span>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-muted uppercase tracking-wider font-semibold flex items-center gap-1">
              <Zap size={12} /> Fuel rate
            </span>
            <input
              type="range"
              min={0}
              max={80}
              step={FUEL_STEP}
              value={fuelRate}
              onChange={(e) => { setFuelOverride(Number(e.target.value)); }}
              className="w-full accent-brand"
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-text">{fuelRate} g/h</span>
              {fuelConfidence && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  fuelConfidence === "high" ? "bg-tint-success text-text"
                    : fuelConfidence === "medium" ? "bg-tint-warning text-text"
                    : "bg-surface text-muted"
                }`}>
                  {fuelConfidence}
                </span>
              )}
            </div>
          </label>
        </div>

        {/* Result */}
        {result && (
          <>
            {/* Reliability gate */}
            {!result.reliable && (
              <div className="bg-tint-warning border border-warning/30 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle size={18} className="text-text flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-text font-medium">Prediction not yet reliable</p>
                  <ul className="text-muted mt-1 space-y-0.5">
                    {result.warnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Chart — always shown but dimmed when unreliable */}
            <BGSimChart curve={result.curve} reliable={result.reliable} maxObservedMinute={result.maxObservedMinute} />

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-surface rounded-lg p-2">
                <div className="text-xs text-muted uppercase tracking-wider font-semibold">End BG</div>
                <div className="text-lg font-semibold text-text">
                  {result.curve[result.curve.length - 1].bg.toFixed(1)}
                </div>
              </div>
              <div className="bg-surface rounded-lg p-2">
                <div className="text-xs text-muted uppercase tracking-wider font-semibold">Min BG</div>
                <div className={`text-lg font-semibold ${result.minBG < 3.9 ? "text-error" : "text-text"}`}>
                  {result.minBG.toFixed(1)}
                </div>
              </div>
              <div className="bg-surface rounded-lg p-2">
                <div className="text-xs text-muted uppercase tracking-wider font-semibold">Hypo risk</div>
                <div className={`text-lg font-semibold ${result.hypoMinute != null ? "text-error" : "text-success"}`}>
                  {result.hypoMinute != null ? `${result.hypoMinute}m` : "None"}
                </div>
              </div>
            </div>

            {/* Confidence band at end */}
            {result.reliable && (
              <div className="text-xs text-muted text-center">
                End range: {result.curve[result.curve.length - 1].bgLow.toFixed(1)} – {result.curve[result.curve.length - 1].bgHigh.toFixed(1)} mmol/L
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
