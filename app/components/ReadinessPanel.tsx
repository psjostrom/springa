"use client";

import { useMemo } from "react";
import { Heart, Activity, Moon, Zap, Gauge } from "lucide-react";
import type { WellnessEntry } from "@/lib/intervalsApi";
import { computeStats, computeReadiness } from "@/lib/readiness";

interface ReadinessPanelProps {
  entries: WellnessEntry[];
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;

  const validData = data.filter(v => v > 0);
  if (validData.length < 2) return null;

  const min = Math.min(...validData);
  const max = Math.max(...validData);
  const range = max - min || 1;

  const width = 60;
  const height = 20;
  const padding = 2;

  const points = validData.map((v, i) => {
    const x = padding + (i / (validData.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((v - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={width - padding}
        cy={height - padding - ((validData[validData.length - 1] - min) / range) * (height - 2 * padding)}
        r={2}
        fill={color}
      />
    </svg>
  );
}

function MetricCard({ label, value, unit, sparkline, icon: Icon, color }: {
  label: string;
  value: number;
  unit: string;
  sparkline: number[];
  icon: typeof Heart;
  color: string;
}) {
  return (
    <div className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a]">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-xs text-[#b8a5d4]">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-lg font-bold" style={{ color }}>{value}</span>
          {unit && <span className="text-xs text-[#b8a5d4] ml-1">{unit}</span>}
        </div>
        <Sparkline data={sparkline} color={color} />
      </div>
    </div>
  );
}

function ReadinessBanner({ readiness, computed }: { readiness: number; computed?: boolean }) {
  let state: { bg: string; border: string; text: string; label: string };

  if (readiness >= 70) {
    state = { bg: "bg-[#1a3d25]", border: "border-[#39ff14]/30", text: "text-[#39ff14]", label: "Ready to train" };
  } else if (readiness >= 50) {
    state = { bg: "bg-[#0d4a5a]", border: "border-[#00ffff]/30", text: "text-[#00ffff]", label: "Good to go" };
  } else if (readiness >= 30) {
    state = { bg: "bg-[#3d2b1a]", border: "border-[#ffb800]/30", text: "text-[#ffb800]", label: "Monitor recovery" };
  } else {
    state = { bg: "bg-[#3d1525]", border: "border-[#ff3366]/30", text: "text-[#ff3366]", label: "Recovery day" };
  }

  return (
    <div className={`${state.bg} ${state.border} border rounded-xl p-4 flex items-center gap-4`}>
      <Gauge className={`w-6 h-6 ${state.text} flex-shrink-0`} />
      <div className="flex-1">
        <div className={`font-bold text-base ${state.text}`}>{state.label}</div>
        <div className="text-sm text-[#c4b5fd]">
          {computed ? "Based on HRV, HR, sleep, form" : "From wearable"}
        </div>
      </div>
      <div className={`text-3xl font-bold ${state.text}`}>{readiness}</div>
    </div>
  );
}

function TSBGauge({ tsb }: { tsb: number }) {
  const normalized = Math.max(0, Math.min(100, ((tsb + 30) / 50) * 100));

  let zone: { label: string; color: string; bg: string };
  if (tsb < -20) {
    zone = { label: "Fatigued", color: "text-[#ff3366]", bg: "bg-[#3d1525]" };
  } else if (tsb < -10) {
    zone = { label: "Loading", color: "text-[#ffb800]", bg: "bg-[#3d2b1a]" };
  } else if (tsb < 5) {
    zone = { label: "Neutral", color: "text-[#c4b5fd]", bg: "bg-[#2a1f3d]" };
  } else if (tsb < 15) {
    zone = { label: "Fresh", color: "text-[#00ffff]", bg: "bg-[#0d4a5a]" };
  } else {
    zone = { label: "Peaked", color: "text-[#39ff14]", bg: "bg-[#1a3d25]" };
  }

  return (
    <div className={`${zone.bg} rounded-lg p-3 border border-[#3d2b5a]`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${zone.color}`} />
          <span className="text-sm text-[#b8a5d4]">Form (TSB)</span>
        </div>
        <span className={`text-sm font-semibold ${zone.color}`}>{zone.label}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className={`text-2xl font-bold ${zone.color}`}>
          {tsb > 0 ? "+" : ""}{tsb}
        </span>
        <div className="flex-1 h-2 bg-[#1a1030] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#ff3366] via-[#ffb800] via-[#c4b5fd] via-[#00ffff] to-[#39ff14]" style={{ width: "100%" }} />
        </div>
      </div>

      <div className="relative h-1 mt-1">
        <div
          className="absolute w-2 h-2 bg-white rounded-full shadow -translate-x-1/2"
          style={{ left: `${normalized}%` }}
        />
      </div>
    </div>
  );
}

export function ReadinessPanel({ entries }: ReadinessPanelProps) {
  const data = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
    const latest = sorted[sorted.length - 1] as WellnessEntry | undefined;

    if (!latest) return null;

    // Get 28-day baseline data
    const baseline28 = sorted.slice(-28);
    const hrvValues = baseline28.map(e => e.hrv).filter((v): v is number => v != null && v > 0);
    const rhrValues = baseline28.map(e => e.restingHR).filter((v): v is number => v != null && v > 0);

    const hrvBaseline = computeStats(hrvValues);
    const rhrBaseline = computeStats(rhrValues);

    // Current values
    const hrv = latest.hrv ?? null;
    const restingHR = latest.restingHR ?? null;
    const sleep = latest.sleepScore ?? (latest.sleepSecs != null ? Math.round(latest.sleepSecs / 3600 * 10) / 10 : null);
    const tsb = latest.ctl != null && latest.atl != null ? Math.round(latest.ctl - latest.atl) : null;

    // Use built-in readiness if available, otherwise compute
    const builtInReadiness = latest.readiness ?? null;
    const computedReadiness = builtInReadiness == null
      ? computeReadiness(hrv, hrvBaseline, restingHR, rhrBaseline, sleep, tsb)
      : null;
    const readiness = builtInReadiness ?? computedReadiness;
    const isComputed = builtInReadiness == null && computedReadiness != null;

    // Sparklines (last 14 days)
    const hrvSparkline = sorted.slice(-14).map(e => e.hrv).filter((v): v is number => v != null && v > 0);
    const hrSparkline = sorted.slice(-14).map(e => e.restingHR).filter((v): v is number => v != null && v > 0);
    const sleepSparkline = sorted.slice(-14).map(e => e.sleepScore ?? (e.sleepSecs ? e.sleepSecs / 3600 : undefined)).filter((v): v is number => v != null && v > 0);

    // Determine sleep label
    const sleepLabel = sleep != null && sleep > 12 ? "Sleep Score" : "Sleep";
    const sleepUnit = sleep != null && sleep > 12 ? "" : "hrs";

    return {
      readiness,
      isComputed,
      hrv,
      restingHR,
      sleep,
      sleepLabel,
      sleepUnit,
      tsb,
      hrvSparkline,
      hrSparkline,
      sleepSparkline,
    };
  }, [entries]);

  if (!data) {
    return (
      <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6 text-center text-[#b8a5d4]">
        No wellness data available
      </div>
    );
  }

  const hasMetrics = data.hrv != null || data.restingHR != null || data.sleep != null;

  return (
    <div className="space-y-3">
      {data.readiness != null && (
        <ReadinessBanner readiness={data.readiness} computed={data.isComputed} />
      )}

      {hasMetrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {data.hrv != null && (
            <MetricCard
              label="HRV"
              value={data.hrv}
              unit="ms"
              sparkline={data.hrvSparkline}
              icon={Activity}
              color="#00ffff"
            />
          )}
          {data.restingHR != null && (
            <MetricCard
              label="Resting HR"
              value={data.restingHR}
              unit="bpm"
              sparkline={data.hrSparkline}
              icon={Heart}
              color="#ff2d95"
            />
          )}
          {data.sleep != null && (
            <MetricCard
              label={data.sleepLabel}
              value={data.sleep}
              unit={data.sleepUnit}
              sparkline={data.sleepSparkline}
              icon={Moon}
              color="#c4b5fd"
            />
          )}
        </div>
      )}

      {data.tsb != null && <TSBGauge tsb={data.tsb} />}

      {data.readiness == null && !hasMetrics && data.tsb == null && (
        <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6 text-center text-[#b8a5d4]">
          No wellness data for today
        </div>
      )}
    </div>
  );
}
