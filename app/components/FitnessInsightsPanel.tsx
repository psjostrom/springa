"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, Activity, Zap, Heart, AlertTriangle } from "lucide-react";
import type { FitnessInsights } from "@/lib/fitness";

interface FitnessInsightsPanelProps {
  insights: FitnessInsights;
}

const FORM_ZONE_STYLES: Record<
  FitnessInsights["formZone"],
  { bg: string; text: string; border: string; icon: typeof AlertTriangle }
> = {
  "high-risk": {
    bg: "bg-[#3d1525]",
    text: "text-[#ff3366]",
    border: "border-[#ff3366]/30",
    icon: AlertTriangle,
  },
  optimal: {
    bg: "bg-[#1a3d25]",
    text: "text-[#39ff14]",
    border: "border-[#39ff14]/30",
    icon: Zap,
  },
  grey: {
    bg: "bg-[#2a1f3d]",
    text: "text-[#c4b5fd]",
    border: "border-[#c4b5fd]/30",
    icon: Minus,
  },
  fresh: {
    bg: "bg-[#0d4a5a]",
    text: "text-[#00ffff]",
    border: "border-[#00ffff]/30",
    icon: Heart,
  },
  transition: {
    bg: "bg-[#3d2b1a]",
    text: "text-[#ffb800]",
    border: "border-[#ffb800]/30",
    icon: Activity,
  },
};

function getExplanation(key: string, insights: FitnessInsights): { definition: string; context: string } | null {
  switch (key) {
    case "ctl": {
      const pct = insights.peakCtl > 0 ? Math.round((insights.currentCtl / insights.peakCtl) * 100) : 0;
      let ctx: string;
      if (insights.currentCtl >= insights.peakCtl && insights.peakCtl > 0) {
        ctx = "You\u2019re at your all-time peak.";
      } else if (pct >= 80) {
        ctx = `At ${pct}% of your peak \u2014 strong shape.`;
      } else if (pct >= 50) {
        ctx = `At ${pct}% of your peak \u2014 still building.`;
      } else {
        ctx = "Still early \u2014 consistency is key.";
      }
      return { definition: "Rolling average of training load over ~6 weeks. Goes up with consistent training, drops with rest.", context: ctx };
    }
    case "atl": {
      let ctx: string;
      if (insights.currentAtl > insights.currentCtl * 1.3) {
        ctx = "Heavy fatigue relative to fitness \u2014 recovery matters now.";
      } else if (insights.currentAtl > insights.currentCtl) {
        ctx = "Fatigue exceeds fitness \u2014 normal during a build phase.";
      } else {
        ctx = "Fatigue is below fitness \u2014 absorbing training well.";
      }
      return { definition: "Short-term training stress \u2014 rolling average over ~7 days. Spikes after hard sessions, drops quickly with rest.", context: ctx };
    }
    case "trend": {
      let ctx: string;
      if (insights.ctlTrend > 3) {
        ctx = "Strong upward trend \u2014 fitness building nicely.";
      } else if (insights.ctlTrend > 0.5) {
        ctx = "Gradual improvement \u2014 consistent and sustainable.";
      } else if (insights.ctlTrend > -0.5) {
        ctx = "Essentially flat \u2014 maintaining current fitness.";
      } else if (insights.ctlTrend > -3) {
        ctx = "Slight decline \u2014 expected during taper or recovery.";
      } else {
        ctx = "Significant drop \u2014 if unplanned, consider more training.";
      }
      return { definition: "How your fitness (CTL) changed over the last 28 days.", context: ctx };
    }
    case "ramp": {
      let ctx: string;
      if (insights.rampRate > 5) {
        ctx = "Growing very fast \u2014 high injury risk, consider backing off.";
      } else if (insights.rampRate > 3) {
        ctx = "Solid build pace \u2014 monitor recovery.";
      } else if (insights.rampRate > 1) {
        ctx = "Steady, sustainable growth.";
      } else if (insights.rampRate > -0.5) {
        ctx = "Essentially flat \u2014 maintaining current fitness.";
      } else {
        ctx = "Declining \u2014 expected during rest, concerning if sustained.";
      }
      return { definition: "Weekly change in fitness (CTL). Above 5 = injury risk. 1\u20134 = solid build.", context: ctx };
    }
    case "form": {
      let ctx: string;
      if (insights.currentTsb < -20) {
        ctx = "Heavily fatigued \u2014 prioritize recovery.";
      } else if (insights.currentTsb < -10) {
        ctx = "Optimal training zone \u2014 building fitness.";
      } else if (insights.currentTsb < 5) {
        ctx = "Maintenance zone \u2014 not fatigued, not peaked.";
      } else if (insights.currentTsb < 15) {
        ctx = "Fresh \u2014 good window for racing or a key session.";
      } else {
        ctx = "Very rested \u2014 extended rest may lead to detraining.";
      }
      return { definition: "Fitness minus Fatigue. Negative = carrying fatigue, positive = fresh. Racing sweet spot: +5 to +15.", context: ctx };
    }
    case "load7": {
      const avgDaily7 = insights.totalActivities7d > 0 ? Math.round(insights.totalLoad7d / 7) : 0;
      let ctx: string;
      if (insights.totalActivities7d === 0) {
        ctx = "No runs this week \u2014 rest or missed training.";
      } else if (avgDaily7 > insights.currentCtl * 1.3) {
        ctx = "Heavy week \u2014 loading above your fitness level.";
      } else if (avgDaily7 >= insights.currentCtl * 0.8) {
        ctx = "On track \u2014 load matches your fitness.";
      } else {
        ctx = "Light week \u2014 below your usual level.";
      }
      return { definition: "Load is a score combining duration and intensity. Easy 30-min run \u2248 30\u201340, hard intervals \u2248 80\u2013100.", context: ctx };
    }
    case "load28": {
      const weeklyAvg = Math.round(insights.totalLoad28d / 4);
      const runsPerWeek = (insights.totalActivities28d / 4).toFixed(1);
      let ctx: string;
      if (insights.totalActivities28d === 0) {
        ctx = "No runs in 28 days.";
      } else {
        ctx = `Averaging ${runsPerWeek} runs/week with ~${weeklyAvg} weekly load.`;
      }
      return { definition: "Load is a score combining duration and intensity. Easy 30-min run \u2248 30\u201340, hard intervals \u2248 80\u2013100.", context: ctx };
    }
    default:
      return null;
  }
}

function MetricPopover({
  metricKey,
  anchorRect,
  onClose,
  insights,
}: {
  metricKey: string;
  anchorRect: DOMRect;
  onClose: () => void;
  insights: FitnessInsights;
}) {
  const info = getExplanation(metricKey, insights);
  if (!info) return null;

  const popoverWidth = 250;
  const gap = 10;
  const showBelow = anchorRect.top < 100;

  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const left = Math.min(
    Math.max(12, anchorCenterX - popoverWidth / 2),
    window.innerWidth - popoverWidth - 12,
  );
  const arrowLeft = Math.min(Math.max(16, anchorCenterX - left), popoverWidth - 16);

  const positionStyle: React.CSSProperties = {
    width: popoverWidth,
    left,
    ...(showBelow
      ? { top: anchorRect.bottom + gap }
      : { bottom: window.innerHeight - anchorRect.top + gap }),
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-[#1e1535] border border-[#3d2b5a] rounded-xl px-3 py-3 shadow-lg shadow-black/50"
        style={positionStyle}
      >
        <div className="text-xs text-[#b8a5d4] leading-relaxed">{info.definition}</div>
        {info.context && (
          <div className="text-xs text-[#00ffff] leading-relaxed mt-1.5 pt-1.5 border-t border-[#3d2b5a]">{info.context}</div>
        )}
        <div
          className={`absolute w-2.5 h-2.5 bg-[#1e1535] border-[#3d2b5a] rotate-45 ${
            showBelow
              ? "-top-[6px] border-l border-t"
              : "-bottom-[6px] border-r border-b"
          }`}
          style={{ left: arrowLeft }}
        />
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a] ${onClick ? "cursor-pointer active:bg-[#2a1f3d] transition-colors" : ""}`}
      onClick={onClick}
    >
      <div className="text-sm text-[#b8a5d4] mb-1">{label}</div>
      <div className={`text-xl font-bold ${color || "text-white"}`}>{value}</div>
      {sub && <div className="text-sm text-[#c4b5fd] mt-0.5">{sub}</div>}
    </div>
  );
}

export function FitnessInsightsPanel({ insights }: FitnessInsightsPanelProps) {
  const [popover, setPopover] = useState<{ key: string; rect: DOMRect } | null>(null);
  const formStyle = FORM_ZONE_STYLES[insights.formZone];
  const FormIcon = formStyle.icon;

  const handleTap = (key: string, e: React.MouseEvent) => {
    if (popover?.key === key) {
      setPopover(null);
      return;
    }
    setPopover({ key, rect: e.currentTarget.getBoundingClientRect() });
  };

  const trendIcon =
    insights.ctlTrend > 1 ? (
      <TrendingUp className="w-4 h-4 text-[#00ffff]" />
    ) : insights.ctlTrend < -1 ? (
      <TrendingDown className="w-4 h-4 text-[#ff3366]" />
    ) : (
      <Minus className="w-4 h-4 text-[#b8a5d4]" />
    );

  const rampWarning =
    insights.rampRate > 5
      ? "Ramp rate is high — injury risk increases above 5/week"
      : insights.rampRate > 3
        ? "Solid build — monitor recovery"
        : null;

  return (
    <div className="space-y-4">
      {popover && (
        <MetricPopover
          metricKey={popover.key}
          anchorRect={popover.rect}
          onClose={() => setPopover(null)}
          insights={insights}
        />
      )}

      {/* Form Zone Banner */}
      <div
        className={`${formStyle.bg} ${formStyle.border} border rounded-xl p-4 flex items-center gap-3 cursor-pointer active:opacity-80 transition-opacity`}
        onClick={(e) => handleTap("form", e)}
      >
        <FormIcon className={`w-6 h-6 ${formStyle.text} flex-shrink-0`} />
        <div className="flex-1">
          <div className={`font-bold text-base ${formStyle.text}`}>
            {insights.formZoneLabel}
          </div>
          <div className="text-sm text-[#c4b5fd]">
            Form: {insights.currentTsb > 0 ? "+" : ""}
            {insights.currentTsb}
            {insights.formZone === "optimal" &&
              " — ready for quality sessions"}
            {insights.formZone === "high-risk" &&
              " — consider an easy day or rest"}
            {insights.formZone === "fresh" &&
              " — good time for a hard session or race"}
            {insights.formZone === "grey" &&
              " — not fatigued, not peaked either"}
            {insights.formZone === "transition" &&
              " — detraining may start if sustained"}
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Fitness (CTL)"
          value={insights.currentCtl.toString()}
          sub={`Peak: ${insights.peakCtl}`}
          color="text-[#00ffff]"
          onClick={(e) => handleTap("ctl", e)}
        />
        <StatCard
          label="Fatigue (ATL)"
          value={insights.currentAtl.toString()}
          color="text-[#c4b5fd]"
          onClick={(e) => handleTap("atl", e)}
        />
        <div
          className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a] cursor-pointer active:bg-[#2a1f3d] transition-colors"
          onClick={(e) => handleTap("trend", e)}
        >
          <div className="text-sm text-[#b8a5d4] mb-1">Fitness Trend</div>
          <div className="flex items-center gap-1.5">
            {trendIcon}
            <span
              className={`text-xl font-bold ${insights.ctlTrend < -1 ? "text-[#ff3366]" : "text-[#00ffff]"}`}
            >
              {insights.ctlTrend > 0 ? "+" : ""}
              {insights.ctlTrend}
            </span>
            <span className="text-sm text-[#b8a5d4]">in 28d</span>
          </div>
        </div>
        <div
          className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a] cursor-pointer active:bg-[#2a1f3d] transition-colors"
          onClick={(e) => handleTap("ramp", e)}
        >
          <div className="text-sm text-[#b8a5d4] mb-1">Ramp Rate</div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl font-bold ${insights.rampRate > 5 ? "text-[#ffb800]" : insights.rampRate < -1 ? "text-[#ff3366]" : "text-[#00ffff]"}`}>
              {insights.rampRate > 0 ? "+" : ""}
              {insights.rampRate}
            </span>
            <span className="text-sm text-[#b8a5d4]">/week</span>
          </div>
        </div>
      </div>

      {/* Ramp Warning */}
      {rampWarning && (
        <div className="bg-[#3d2b1a] border border-[#ffb800]/30 rounded-lg px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#ffb800] flex-shrink-0" />
          <span className="text-sm text-[#ffb800]">{rampWarning}</span>
        </div>
      )}

      {/* Activity Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a] cursor-pointer active:bg-[#2a1f3d] transition-colors"
          onClick={(e) => handleTap("load7", e)}
        >
          <div className="text-sm text-[#b8a5d4] mb-1">Last 7 days</div>
          <div className="text-lg font-bold text-white">
            {insights.totalActivities7d}{" "}
            <span className="text-sm font-normal text-[#b8a5d4]">
              {insights.totalActivities7d === 1 ? "run" : "runs"}
            </span>
          </div>
          <div className="text-sm text-[#c4b5fd] mt-0.5">
            {insights.totalLoad7d} load
          </div>
        </div>
        <div
          className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a] cursor-pointer active:bg-[#2a1f3d] transition-colors"
          onClick={(e) => handleTap("load28", e)}
        >
          <div className="text-sm text-[#b8a5d4] mb-1">Last 28 days</div>
          <div className="text-lg font-bold text-white">
            {insights.totalActivities28d}{" "}
            <span className="text-sm font-normal text-[#b8a5d4]">runs</span>
          </div>
          <div className="text-sm text-[#c4b5fd] mt-0.5">
            {insights.totalLoad28d} load
          </div>
        </div>
      </div>
    </div>
  );
}
