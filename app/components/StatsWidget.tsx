"use client";

import { Flame, Footprints, HeartPulse, Zap, Gauge } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WidgetProps } from "@/lib/modalWidgets";
import { classifyHR, ZONE_COLORS } from "@/lib/constants";

// --- Judgment helpers ---

interface Judgment {
  label: string;
  color: string;
  /** 0–1 fraction for gauge bar width */
  fraction: number;
}

function judgeCadence(spm: number): Judgment {
  if (spm >= 180) return { label: "Excellent", color: "#39ff14", fraction: Math.min(spm / 200, 1) };
  if (spm >= 170) return { label: "Good", color: "#06b6d4", fraction: spm / 200 };
  if (spm >= 160) return { label: "OK", color: "#fbbf24", fraction: spm / 200 };
  return { label: "Low", color: "#ff3366", fraction: spm / 200 };
}

function judgeMaxHR(hr: number, hrZones?: number[]): Judgment {
  if (!hrZones || hrZones.length < 5) {
    return { label: `${hr} bpm`, color: "#b8a5d4", fraction: Math.min(hr / 200, 1) };
  }
  const zone = classifyHR(hr, hrZones);
  const zoneLabel = zone.toUpperCase();
  return { label: zoneLabel, color: ZONE_COLORS[zone], fraction: Math.min(hr / hrZones[4], 1) };
}

function judgeLoad(load: number): Judgment {
  if (load >= 150) return { label: "Very Hard", color: "#ff3366", fraction: Math.min(load / 200, 1) };
  if (load >= 100) return { label: "Hard", color: "#fb923c", fraction: load / 200 };
  if (load >= 50) return { label: "Moderate", color: "#fbbf24", fraction: load / 200 };
  return { label: "Light", color: "#39ff14", fraction: load / 200 };
}

function judgeIntensity(pct: number): Judgment {
  if (pct >= 100) return { label: "Maximum", color: "#ff3366", fraction: 1 };
  if (pct >= 80) return { label: "Hard", color: "#fb923c", fraction: pct / 100 };
  if (pct >= 60) return { label: "Moderate", color: "#fbbf24", fraction: pct / 100 };
  return { label: "Easy", color: "#39ff14", fraction: pct / 100 };
}

// --- Card component ---

interface StatCardProps {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  value: string;
  unit: string;
  judgment: Judgment;
}

function StatCard({ icon: Icon, iconColor, label, value, unit, judgment }: StatCardProps) {
  return (
    <div className="bg-[#2a1f3d] rounded-lg p-3 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
        <span className="text-xs text-[#b8a5d4]">{label}</span>
        <span className="ml-auto text-xs font-medium" style={{ color: judgment.color }}>
          {judgment.label}
        </span>
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
    </div>
  );
}

// --- Widget ---

export function StatsWidget({ event, hrZones }: WidgetProps) {
  const cards: React.ReactNode[] = [];

  if (event.calories) {
    cards.push(
      <StatCard
        key="cal"
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
      <StatCard
        key="cad"
        icon={Footprints}
        iconColor="#06b6d4"
        label="Cadence"
        value={String(spm)}
        unit="spm"
        judgment={judgeCadence(spm)}
      />
    );
  }

  if (event.maxHr) {
    cards.push(
      <StatCard
        key="mhr"
        icon={HeartPulse}
        iconColor="#ff3366"
        label="Max HR"
        value={String(event.maxHr)}
        unit="bpm"
        judgment={judgeMaxHR(event.maxHr, hrZones)}
      />
    );
  }

  if (event.load) {
    const load = Math.round(event.load);
    cards.push(
      <StatCard
        key="load"
        icon={Zap}
        iconColor="#fbbf24"
        label="Load"
        value={String(load)}
        unit=""
        judgment={judgeLoad(load)}
      />
    );
  }

  if (event.intensity !== undefined) {
    const pct = Math.round(event.intensity);
    cards.push(
      <StatCard
        key="int"
        icon={Gauge}
        iconColor="#c4b5fd"
        label="Intensity"
        value={`${pct}%`}
        unit=""
        judgment={judgeIntensity(pct)}
      />
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
