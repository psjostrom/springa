"use client";

import { useState, useMemo } from "react";
import { useAtomValue } from "jotai";
import { AlertTriangle, TrendingDown, Zap, Timer } from "lucide-react";
import { simulateBG, type SimulationResult } from "@/lib/bgSimulation";
import type { WorkoutCategory } from "@/lib/types";
import { BGSimChart } from "../components/BGSimChart";
import { bgModelAtom, bgModelLoadingAtom } from "../atoms";

const CATEGORIES: { key: WorkoutCategory; label: string; color: string }[] = [
  { key: "easy", label: "Easy", color: "#06b6d4" },
  { key: "long", label: "Long", color: "#fbbf24" },
  { key: "interval", label: "Interval", color: "#fb923c" },
];

export function SimulateScreen() {
  const bgModel = useAtomValue(bgModelAtom);
  const bgModelLoading = useAtomValue(bgModelLoadingAtom);
  const [category, setCategory] = useState<WorkoutCategory>("easy");
  const [durationMin, setDurationMin] = useState(45);
  const [startBG, setStartBG] = useState(9.0);
  const [fuelRate, setFuelRate] = useState(60);
  const [fuelKnown, setFuelKnown] = useState(true);

  const result: SimulationResult | null = useMemo(() => {
    if (!bgModel || bgModel.activitiesAnalyzed === 0) return null;
    return simulateBG({
      startBG,
      entrySlope: null,
      segments: [{ durationMin, category }],
      fuelRateGH: fuelKnown ? fuelRate : null,
      bgModel,
    });
  }, [bgModel, category, durationMin, startBG, fuelRate, fuelKnown]);

  if (bgModelLoading) {
    return (
      <div className="h-full flex items-center justify-center text-[#af9ece]">
        Loading BG model…
      </div>
    );
  }

  if (!bgModel || bgModel.activitiesAnalyzed === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#af9ece] px-6 text-center">
        No BG data yet. Complete some runs with glucose data to enable simulation.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-16 md:pb-4">
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <h2 className="text-lg font-semibold text-white">BG Simulation</h2>

        {/* Category selector */}
        <div className="flex gap-2">
          {CATEGORIES.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => { setCategory(key); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                category === key
                  ? "text-white shadow-lg"
                  : "text-[#af9ece] bg-[#1d1828] hover:bg-[#2e293c]"
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
            <span className="text-xs text-[#af9ece] flex items-center gap-1">
              <Timer size={12} /> Duration
            </span>
            <input
              type="range"
              min={15}
              max={120}
              step={5}
              value={durationMin}
              onChange={(e) => { setDurationMin(Number(e.target.value)); }}
              className="w-full accent-[#00ffff]"
            />
            <span className="text-sm text-white">{durationMin} min</span>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-[#af9ece] flex items-center gap-1">
              <TrendingDown size={12} /> Start BG
            </span>
            <input
              type="range"
              min={4}
              max={16}
              step={0.5}
              value={startBG}
              onChange={(e) => { setStartBG(Number(e.target.value)); }}
              className="w-full accent-[#00ffff]"
            />
            <span className="text-sm text-white">{startBG.toFixed(1)} mmol/L</span>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-[#af9ece] flex items-center gap-1">
              <Zap size={12} /> Fuel rate
            </span>
            <input
              type="range"
              min={0}
              max={120}
              step={4}
              value={fuelRate}
              onChange={(e) => { setFuelRate(Number(e.target.value)); }}
              disabled={!fuelKnown}
              className="w-full accent-[#00ffff] disabled:opacity-30"
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-white">{fuelKnown ? `${fuelRate} g/h` : "Unknown"}</span>
              <button
                onClick={() => { setFuelKnown(!fuelKnown); }}
                className={`text-xs px-1.5 py-0.5 rounded transition ${
                  fuelKnown
                    ? "bg-[#1a3d25] text-[#39ff14]"
                    : "bg-[#3d2b1a] text-[#ffb800]"
                }`}
              >
                {fuelKnown ? "known" : "unknown"}
              </button>
            </div>
          </label>
        </div>

        {/* Result */}
        {result && (
          <>
            {/* Reliability gate */}
            {!result.reliable && (
              <div className="bg-[#3d2b1a] border border-[#ffb800]/30 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle size={18} className="text-[#ffb800] flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-[#ffb800] font-medium">Prediction not yet reliable</p>
                  <ul className="text-[#af9ece] mt-1 space-y-0.5">
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
              <div className="bg-[#1d1828] rounded-lg p-2">
                <div className="text-xs text-[#af9ece]">End BG</div>
                <div className="text-lg font-semibold text-white">
                  {result.curve[result.curve.length - 1].bg.toFixed(1)}
                </div>
              </div>
              <div className="bg-[#1d1828] rounded-lg p-2">
                <div className="text-xs text-[#af9ece]">Min BG</div>
                <div className={`text-lg font-semibold ${result.minBG < 3.9 ? "text-[#ff3366]" : "text-white"}`}>
                  {result.minBG.toFixed(1)}
                </div>
              </div>
              <div className="bg-[#1d1828] rounded-lg p-2">
                <div className="text-xs text-[#af9ece]">Hypo risk</div>
                <div className={`text-lg font-semibold ${result.hypoMinute != null ? "text-[#ff3366]" : "text-[#39ff14]"}`}>
                  {result.hypoMinute != null ? `${result.hypoMinute}m` : "None"}
                </div>
              </div>
            </div>

            {/* Confidence band at end */}
            {result.reliable && (
              <div className="text-xs text-[#af9ece] text-center">
                End range: {result.curve[result.curve.length - 1].bgLow.toFixed(1)} – {result.curve[result.curve.length - 1].bgHigh.toFixed(1)} mmol/L
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
