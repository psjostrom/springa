"use client";

import { useMemo, useState } from "react";
import { Heart, Activity, Moon, Zap, Gauge } from "lucide-react";
import type { WellnessEntry } from "@/lib/intervalsApi";
import { computeStats, computeReadiness } from "@/lib/readiness";

interface ReadinessPanelProps {
  entries: WellnessEntry[];
}

interface Baseline {
  mean: number;
  sd: number;
}

type MetricKey = "hrv" | "rhr" | "sleep" | "tsb" | "readiness";

interface PopoverState {
  metric: MetricKey;
  anchorRect: DOMRect;
  value: number;
  baseline: Baseline;
  sparkline: number[];
  color: string;
}

function getReadinessExplanation(
  metric: MetricKey,
  value: number,
  baseline: Baseline
): { definition: string; context: string } {
  const zScore = baseline.sd > 0 ? (value - baseline.mean) / baseline.sd : 0;

  switch (metric) {
    case "hrv": {
      let ctx: string;
      if (zScore > 1) {
        ctx = "Well above your baseline — excellent recovery.";
      } else if (zScore > 0.3) {
        ctx = "Above average — good recovery state.";
      } else if (zScore > -0.3) {
        ctx = "Within normal range.";
      } else if (zScore > -1) {
        ctx = "Below average — consider lighter training.";
      } else {
        ctx = "Well below baseline — prioritize recovery.";
      }
      return {
        definition: "Heart Rate Variability measures nervous system recovery. Higher values typically indicate better recovery and readiness.",
        context: ctx,
      };
    }
    case "rhr": {
      const diff = value - baseline.mean;
      let ctx: string;
      if (diff < -3) {
        ctx = `${Math.abs(Math.round(diff))} bpm below average — very fresh.`;
      } else if (diff < -1) {
        ctx = "Slightly below average — well recovered.";
      } else if (diff < 2) {
        ctx = "At your normal baseline.";
      } else if (diff < 5) {
        ctx = "Elevated — possible fatigue or stress.";
      } else {
        ctx = `${Math.round(diff)} bpm above average — significant elevation.`;
      }
      return {
        definition: "Resting heart rate reflects cardiovascular recovery. Lower values typically indicate better fitness and recovery.",
        context: ctx,
      };
    }
    case "sleep": {
      let ctx: string;
      if (value > 12) {
        // Sleep score
        if (value >= 80) {
          ctx = "Excellent sleep — optimal for recovery.";
        } else if (value >= 60) {
          ctx = "Decent sleep — adequate recovery.";
        } else {
          ctx = "Poor sleep score — recovery may be impacted.";
        }
      } else {
        // Sleep hours
        if (value >= 8) {
          ctx = "Optimal duration for recovery.";
        } else if (value >= 7) {
          ctx = "Good sleep duration.";
        } else if (value >= 6) {
          ctx = "Slightly short — aim for 7-9 hours.";
        } else {
          ctx = "Insufficient sleep — recovery impacted.";
        }
      }
      return {
        definition: value > 12
          ? "Sleep quality score from your wearable (0-100). Factors in duration, deep sleep, and restfulness."
          : "Total sleep duration. 7-9 hours recommended for optimal recovery.",
        context: ctx,
      };
    }
    case "tsb": {
      let ctx: string;
      if (value < -20) {
        ctx = "Heavily fatigued — prioritize recovery days.";
      } else if (value < -10) {
        ctx = "Loading phase — fitness building, fatigue accumulating.";
      } else if (value < 5) {
        ctx = "Balanced state — can train or rest as needed.";
      } else if (value < 15) {
        ctx = "Fresh — good window for quality sessions or racing.";
      } else {
        ctx = "Very fresh — extended rest may lead to detraining.";
      }
      return {
        definition: "Training Stress Balance = Fitness (CTL) minus Fatigue (ATL). Negative means carrying fatigue, positive means fresh.",
        context: ctx,
      };
    }
    case "readiness": {
      let ctx: string;
      if (value >= 70) {
        ctx = "Excellent recovery — ready for hard training.";
      } else if (value >= 50) {
        ctx = "Good state — normal training appropriate.";
      } else if (value >= 30) {
        ctx = "Moderate fatigue — consider easier sessions.";
      } else {
        ctx = "Recovery needed — rest or very light activity.";
      }
      return {
        definition: "Composite score (0-100) combining HRV, resting HR, sleep, and form. Weights: HRV 30%, HR 20%, Sleep 25%, Form 25%.",
        context: ctx,
      };
    }
  }
}

function EnlargedSparkline({ data, color, baseline }: { data: number[]; color: string; baseline?: Baseline }) {
  if (data.length < 2) return null;

  const validData = data.filter(v => v > 0);
  if (validData.length < 2) return null;

  const min = Math.min(...validData);
  const max = Math.max(...validData);
  const range = max - min || 1;

  const width = 220;
  const height = 60;
  const padding = 8;

  const points = validData.map((v, i) => {
    const x = padding + (i / (validData.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((v - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(" ");

  // Baseline band (mean ± 0.5 SD)
  let baselineBand = null;
  if (baseline && baseline.sd > 0) {
    const bandTop = height - padding - ((baseline.mean + baseline.sd * 0.5 - min) / range) * (height - 2 * padding);
    const bandBottom = height - padding - ((baseline.mean - baseline.sd * 0.5 - min) / range) * (height - 2 * padding);
    const clampedTop = Math.max(padding, Math.min(height - padding, bandTop));
    const clampedBottom = Math.max(padding, Math.min(height - padding, bandBottom));
    baselineBand = (
      <rect
        x={padding}
        y={clampedTop}
        width={width - 2 * padding}
        height={Math.max(0, clampedBottom - clampedTop)}
        fill={color}
        fillOpacity={0.1}
      />
    );
  }

  const avg = Math.round(validData.reduce((a, b) => a + b, 0) / validData.length);

  return (
    <div>
      <svg width={width} height={height} className="mb-2">
        {baselineBand}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {validData.map((v, i) => {
          const x = padding + (i / (validData.length - 1)) * (width - 2 * padding);
          const y = height - padding - ((v - min) / range) * (height - 2 * padding);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i === validData.length - 1 ? 4 : 2}
              fill={color}
              opacity={i === validData.length - 1 ? 1 : 0.5}
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-xs text-muted">
        <span>Min: {Math.round(min)}</span>
        <span>Avg: {avg}</span>
        <span>Max: {Math.round(max)}</span>
      </div>
    </div>
  );
}

function ReadinessDetailPopover({
  metric,
  anchorRect,
  value,
  baseline,
  sparkline,
  color,
  onClose,
}: PopoverState & { onClose: () => void }) {
  const info = getReadinessExplanation(metric, value, baseline);
  const popoverWidth = 260;
  const gap = 10;
  const showBelow = anchorRect.top < 120;

  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const left = Math.min(
    Math.max(12, anchorCenterX - popoverWidth / 2),
    window.innerWidth - popoverWidth - 12
  );
  const arrowLeft = Math.min(Math.max(16, anchorCenterX - left), popoverWidth - 16);

  const positionStyle: React.CSSProperties = {
    width: popoverWidth,
    left,
    ...(showBelow
      ? { top: anchorRect.bottom + gap }
      : { bottom: window.innerHeight - anchorRect.top + gap }),
  };

  const showGraph = sparkline.length >= 2 && metric !== "readiness";

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-surface border border-border rounded-xl px-4 py-3 shadow-lg shadow-black/50"
        style={positionStyle}
      >
        <div className="text-xs text-muted leading-relaxed">{info.definition}</div>
        <div className="text-xs leading-relaxed mt-1.5 pt-1.5 border-t border-border" style={{ color }}>
          {info.context}
        </div>
        {showGraph && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-xs text-muted mb-2">Last 14 days</div>
            <EnlargedSparkline data={sparkline} color={color} baseline={baseline} />
          </div>
        )}
        <div
          className={`absolute w-2.5 h-2.5 bg-surface border-border rotate-45 ${
            showBelow ? "-top-[6px] border-l border-t" : "-bottom-[6px] border-r border-b"
          }`}
          style={{ left: arrowLeft }}
        />
      </div>
    </>
  );
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

function MetricCard({
  label,
  value,
  unit,
  sparkline,
  icon: Icon,
  color,
  onClick,
}: {
  label: string;
  value: number;
  unit: string;
  sparkline: number[];
  icon: typeof Heart;
  color: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`bg-bg rounded-lg p-3 border border-border ${onClick ? "cursor-pointer active:bg-border transition-colors" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-xs text-muted uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-lg font-bold" style={{ color }}>{value}</span>
          {unit && <span className="text-xs text-muted ml-1">{unit}</span>}
        </div>
        <Sparkline data={sparkline} color={color} />
      </div>
    </div>
  );
}

function ReadinessBanner({
  readiness,
  computed,
  onClick,
}: {
  readiness: number;
  computed?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  let state: { bg: string; border: string; text: string; label: string };

  if (readiness >= 70) {
    state = { bg: "bg-tint-success", border: "border-success/30", text: "text-white", label: "Ready to train" };
  } else if (readiness >= 50) {
    state = { bg: "bg-tint-success", border: "border-success/30", text: "text-white", label: "Good to go" };
  } else if (readiness >= 30) {
    state = { bg: "bg-tint-warning", border: "border-warning/30", text: "text-white", label: "Monitor recovery" };
  } else {
    state = { bg: "bg-tint-error", border: "border-error/30", text: "text-white", label: "Recovery day" };
  }

  return (
    <div
      className={`${state.bg} ${state.border} border rounded-xl p-4 flex items-center gap-4 ${onClick ? "cursor-pointer active:opacity-80 transition-opacity" : ""}`}
      onClick={onClick}
    >
      <Gauge className={`w-6 h-6 ${state.text} flex-shrink-0`} />
      <div className="flex-1">
        <div className={`font-bold text-base ${state.text}`}>{state.label}</div>
        <div className="text-sm text-muted">
          {computed ? "Based on HRV, HR, sleep, form" : "From wearable"}
        </div>
      </div>
      <div className={`text-3xl font-bold ${state.text}`}>{readiness}</div>
    </div>
  );
}

function TSBGauge({ tsb, onClick }: { tsb: number; onClick?: (e: React.MouseEvent) => void }) {
  const normalized = Math.max(0, Math.min(100, ((tsb + 30) / 50) * 100));

  let zone: { label: string; color: string; bg: string };
  if (tsb < -20) {
    zone = { label: "Fatigued", color: "text-white", bg: "bg-tint-error" };
  } else if (tsb < -10) {
    zone = { label: "Loading", color: "text-white", bg: "bg-tint-warning" };
  } else if (tsb < 5) {
    zone = { label: "Neutral", color: "text-muted", bg: "bg-border" };
  } else if (tsb < 15) {
    zone = { label: "Fresh", color: "text-white", bg: "bg-tint-success" };
  } else {
    zone = { label: "Peaked", color: "text-white", bg: "bg-tint-success" };
  }

  return (
    <div
      className={`${zone.bg} rounded-lg p-3 border border-border ${onClick ? "cursor-pointer active:opacity-80 transition-opacity" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${zone.color}`} />
          <span className="text-xs text-muted uppercase tracking-wider font-semibold">Form (TSB)</span>
        </div>
        <span className={`text-sm font-semibold ${zone.color}`}>{zone.label}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className={`text-2xl font-bold ${zone.color}`}>
          {tsb > 0 ? "+" : ""}{tsb}
        </span>
        <div className="flex-1 h-2 bg-bg rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-error via-warning via-muted via-glucose to-success" style={{ width: "100%" }} />
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
  const [popover, setPopover] = useState<PopoverState | null>(null);

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
    const computedReadinessValue = builtInReadiness == null
      ? computeReadiness(hrv, hrvBaseline, restingHR, rhrBaseline, sleep, tsb)
      : null;
    const readiness = builtInReadiness ?? computedReadinessValue;
    const isComputed = builtInReadiness == null && computedReadinessValue != null;

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
      hrvBaseline,
      rhrBaseline,
    };
  }, [entries]);

  if (!data) {
    return (
      <div className="bg-surface rounded-xl border border-border p-6 text-center text-muted">
        No wellness data available
      </div>
    );
  }

  const handleTap = (metric: MetricKey, value: number, baseline: Baseline, sparkline: number[], color: string, e: React.MouseEvent) => {
    if (popover?.metric === metric) {
      setPopover(null);
      return;
    }
    setPopover({
      metric,
      anchorRect: e.currentTarget.getBoundingClientRect(),
      value,
      baseline,
      sparkline,
      color,
    });
  };

  const hasMetrics = data.hrv != null || data.restingHR != null || data.sleep != null;

  return (
    <div className="space-y-3">
      {popover && (
        <ReadinessDetailPopover
          {...popover}
          onClose={() => { setPopover(null); }}
        />
      )}

      {data.readiness != null && (
        <ReadinessBanner
          readiness={data.readiness}
          computed={data.isComputed}
          onClick={(e) => { if (data.readiness != null) handleTap("readiness", data.readiness, { mean: 50, sd: 15 }, [], "var(--color-muted)", e); }}
        />
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
              color="var(--color-chart-primary)"
              onClick={(e) => { if (data.hrv != null) handleTap("hrv", data.hrv, data.hrvBaseline, data.hrvSparkline, "var(--color-chart-primary)", e); }}
            />
          )}
          {data.restingHR != null && (
            <MetricCard
              label="Resting HR"
              value={data.restingHR}
              unit="bpm"
              sparkline={data.hrSparkline}
              icon={Heart}
              color="var(--color-brand)"
              onClick={(e) => { if (data.restingHR != null) handleTap("rhr", data.restingHR, data.rhrBaseline, data.hrSparkline, "var(--color-brand)", e); }}
            />
          )}
          {data.sleep != null && (
            <MetricCard
              label={data.sleepLabel}
              value={data.sleep}
              unit={data.sleepUnit}
              sparkline={data.sleepSparkline}
              icon={Moon}
              color="var(--color-muted)"
              onClick={(e) => { if (data.sleep != null) handleTap("sleep", data.sleep, { mean: 0, sd: 0 }, data.sleepSparkline, "var(--color-muted)", e); }}
            />
          )}
        </div>
      )}

      {data.tsb != null && (
        <TSBGauge
          tsb={data.tsb}
          onClick={(e) => { if (data.tsb != null) handleTap("tsb", data.tsb, { mean: 0, sd: 0 }, [], "var(--color-muted)", e); }}
        />
      )}

      {data.readiness == null && !hasMetrics && data.tsb == null && (
        <div className="bg-surface rounded-xl border border-border p-6 text-center text-muted">
          No wellness data for today
        </div>
      )}
    </div>
  );
}
