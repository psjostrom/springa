"use client";

import { useState } from "react";
import { Flame, Footprints, HeartPulse, Zap, Gauge, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WidgetProps } from "@/lib/modalWidgets";
import { classifyHR, ZONE_COLORS } from "@/lib/constants";

// --- Judgment helpers ---

interface Judgment {
  label: string;
  color: string;
  /** 0–1 fraction for gauge bar — reflects judgment tier, not linear scale */
  fraction: number;
}

function judgeCadence(spm: number): Judgment {
  if (spm >= 180) return { label: "Excellent", color: "#39ff14", fraction: 1.0 };
  if (spm >= 170) return { label: "Good", color: "#06b6d4", fraction: 0.75 };
  if (spm >= 160) return { label: "OK", color: "#fbbf24", fraction: 0.5 };
  return { label: "Low", color: "#ff3366", fraction: 0.25 };
}

function judgeMaxHR(hr: number, hrZones?: number[]): Judgment {
  if (!hrZones || hrZones.length < 5) {
    return { label: "", color: "#b8a5d4", fraction: 0.5 };
  }
  const zone = classifyHR(hr, hrZones);
  const fractions: Record<string, number> = { z1: 0.2, z2: 0.4, z3: 0.6, z4: 0.8, z5: 1.0 };
  return { label: zone.toUpperCase(), color: ZONE_COLORS[zone], fraction: fractions[zone] };
}

function judgeLoad(load: number): Judgment {
  if (load >= 150) return { label: "Very Hard", color: "#ff3366", fraction: 1.0 };
  if (load >= 100) return { label: "Hard", color: "#fb923c", fraction: 0.75 };
  if (load >= 50) return { label: "Moderate", color: "#fbbf24", fraction: 0.5 };
  return { label: "Light", color: "#39ff14", fraction: 0.25 };
}

function judgeIntensity(pct: number): Judgment {
  if (pct >= 100) return { label: "Maximum", color: "#ff3366", fraction: 1.0 };
  if (pct >= 80) return { label: "Hard", color: "#fb923c", fraction: 0.75 };
  if (pct >= 60) return { label: "Moderate", color: "#fbbf24", fraction: 0.5 };
  return { label: "Easy", color: "#39ff14", fraction: 0.25 };
}

function judgeHRCompliance(pct: number): Judgment {
  if (pct >= 60) return { label: "Good", color: "#39ff14", fraction: 0.9 };
  if (pct >= 40) return { label: "OK", color: "#fbbf24", fraction: 0.6 };
  return { label: "Poor", color: "#ff3366", fraction: 0.3 };
}

// --- Popover ---

interface PopoverContent {
  title: string;
  description: string;
}

const STAT_INFO: Record<string, PopoverContent> = {
  cal: { title: "Calories", description: "Total energy expenditure estimated from heart rate and duration." },
  cad: { title: "Cadence", description: "Steps per minute. 170+ spm indicates efficient running form with minimal overstriding. Below 160 suggests overstriding." },
  mhr: { title: "Max Heart Rate", description: "Peak heart rate during the activity. Classified by your HR zone boundaries." },
  load: { title: "Training Load", description: "How hard this activity was relative to your capabilities. 1 hour at threshold is roughly 100 load." },
  int: { title: "Intensity", description: "How hard the activity was compared to your threshold. Over 100% for an hour or longer suggests your threshold setting is too low." },
  hr: { title: "HR Zone Compliance", description: "Percentage of time spent in the target heart rate zone for this workout type. Easy/long runs target Z2, intervals target Z4." },
};

function StatPopover({ info, onClose }: { info: PopoverContent; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4 w-64 shadow-xl" onClick={(e) => { e.stopPropagation(); }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-white">{info.title}</span>
          <button onClick={onClose} aria-label="Close" className="text-[#b8a5d4] hover:text-white text-sm">✕</button>
        </div>
        <p className="text-sm text-[#b8a5d4] leading-relaxed">{info.description}</p>
      </div>
    </div>
  );
}

// --- Card component ---

interface StatCardProps {
  id: string;
  icon: LucideIcon;
  iconColor: string;
  label: string;
  value: string;
  unit: string;
  judgment: Judgment;
}

function StatCard({ id, icon: Icon, iconColor, label, value, unit, judgment }: StatCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  const info = STAT_INFO[id];

  return (
    <>
      <button
        type="button"
        onClick={() => { setShowPopover(true); }}
        className="bg-[#2a1f3d] rounded-lg p-3 space-y-1.5 text-left transition-colors active:bg-[#3d2b5a]"
      >
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
          <span className="text-xs text-[#b8a5d4]">{label}</span>
          {judgment.label && (
            <span className="ml-auto text-xs font-medium" style={{ color: judgment.color }}>
              {judgment.label}
            </span>
          )}
        </div>
        <div className="text-lg font-bold text-white">
          {value} <span className="text-sm text-[#8b7ba8] font-normal">{unit}</span>
        </div>
        <div className="h-1 bg-[#1e1535] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.round(judgment.fraction * 100)}%`, backgroundColor: judgment.color }}
          />
        </div>
      </button>
      {showPopover && <StatPopover info={info} onClose={() => { setShowPopover(false); }} />}
    </>
  );
}

// --- Widget ---

export function StatsWidget({ event, hrZones }: WidgetProps) {
  const cards: React.ReactNode[] = [];

  // HR Zone compliance — moved here from Report Card
  if (event.zoneTimes) {
    const total = event.zoneTimes.z1 + event.zoneTimes.z2 + event.zoneTimes.z3 + event.zoneTimes.z4 + event.zoneTimes.z5;
    if (total > 0) {
      // Determine target zone based on category
      const cat = event.category;
      let targetSec: number;
      let targetLabel: string;
      if (cat === "interval") {
        targetSec = event.zoneTimes.z4 + event.zoneTimes.z5;
        targetLabel = "Z4";
      } else if (cat === "easy" || cat === "long") {
        targetSec = event.zoneTimes.z2;
        targetLabel = "Z2";
      } else {
        targetSec = event.zoneTimes.z2 + event.zoneTimes.z3;
        targetLabel = "Z2+Z3";
      }
      const pct = Math.round((targetSec / total) * 100);
      cards.push(
        <StatCard
          key="hr"
          id="hr"
          icon={Activity}
          iconColor="#06b6d4"
          label="HR Zone"
          value={`${pct}%`}
          unit={targetLabel}
          judgment={judgeHRCompliance(pct)}
        />
      );
    }
  }

  if (event.calories) {
    cards.push(
      <StatCard
        key="cal"
        id="cal"
        icon={Flame}
        iconColor="#fb923c"
        label="Calories"
        value={String(event.calories)}
        unit="kcal"
        judgment={{ label: "", color: "#fb923c", fraction: Math.min(event.calories / 800, 1) }}
      />
    );
  }

  if (event.cadence) {
    const spm = Math.round(event.cadence);
    cards.push(
      <StatCard key="cad" id="cad" icon={Footprints} iconColor="#06b6d4" label="Cadence" value={String(spm)} unit="spm" judgment={judgeCadence(spm)} />
    );
  }

  if (event.maxHr) {
    cards.push(
      <StatCard key="mhr" id="mhr" icon={HeartPulse} iconColor="#ff3366" label="Max HR" value={String(event.maxHr)} unit="bpm" judgment={judgeMaxHR(event.maxHr, hrZones)} />
    );
  }

  if (event.load) {
    const load = Math.round(event.load);
    cards.push(
      <StatCard key="load" id="load" icon={Zap} iconColor="#fbbf24" label="Load" value={String(load)} unit="" judgment={judgeLoad(load)} />
    );
  }

  if (event.intensity !== undefined) {
    const pct = Math.round(event.intensity);
    cards.push(
      <StatCard key="int" id="int" icon={Gauge} iconColor="#c4b5fd" label="Intensity" value={`${pct}%`} unit="" judgment={judgeIntensity(pct)} />
    );
  }

  if (cards.length === 0) return null;

  return (
    <div className="p-2">
      <div className="grid grid-cols-3 gap-2">
        {cards}
      </div>
    </div>
  );
}
