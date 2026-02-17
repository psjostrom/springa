"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, Activity, Zap, Heart, AlertTriangle, Info } from "lucide-react";
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

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a]">
      <div className="text-sm text-[#8b7aaa] mb-1">{label}</div>
      <div className={`text-xl font-bold ${color || "text-white"}`}>{value}</div>
      {sub && <div className="text-sm text-[#a78bca] mt-0.5">{sub}</div>}
    </div>
  );
}

export function FitnessInsightsPanel({ insights }: FitnessInsightsPanelProps) {
  const [showExplainer, setShowExplainer] = useState(false);
  const formStyle = FORM_ZONE_STYLES[insights.formZone];
  const FormIcon = formStyle.icon;

  const trendIcon =
    insights.ctlTrend > 1 ? (
      <TrendingUp className="w-4 h-4 text-[#00ffff]" />
    ) : insights.ctlTrend < -1 ? (
      <TrendingDown className="w-4 h-4 text-[#ff3366]" />
    ) : (
      <Minus className="w-4 h-4 text-[#8b7aaa]" />
    );

  const rampWarning =
    insights.rampRate > 5
      ? "Ramp rate is high — injury risk increases above 5/week"
      : insights.rampRate > 3
        ? "Solid build — monitor recovery"
        : null;

  return (
    <div className="space-y-4">
      {/* Form Zone Banner */}
      <div
        className={`${formStyle.bg} ${formStyle.border} border rounded-xl p-4 flex items-center gap-3`}
      >
        <FormIcon className={`w-6 h-6 ${formStyle.text} flex-shrink-0`} />
        <div className="flex-1">
          <div className={`font-bold text-base ${formStyle.text}`}>
            {insights.formZoneLabel}
          </div>
          <div className="text-sm text-[#a78bca]">
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
        />
        <StatCard
          label="Fatigue (ATL)"
          value={insights.currentAtl.toString()}
          color="text-[#c4b5fd]"
        />
        <div className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a]">
          <div className="text-sm text-[#8b7aaa] mb-1">Fitness Trend</div>
          <div className="flex items-center gap-1.5">
            {trendIcon}
            <span
              className={`text-xl font-bold ${insights.ctlTrend < -1 ? "text-[#ff3366]" : "text-[#00ffff]"}`}
            >
              {insights.ctlTrend > 0 ? "+" : ""}
              {insights.ctlTrend}
            </span>
            <span className="text-sm text-[#8b7aaa]">in 28d</span>
          </div>
        </div>
        <div className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a]">
          <div className="text-sm text-[#8b7aaa] mb-1">Ramp Rate</div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl font-bold ${insights.rampRate > 5 ? "text-[#ffb800]" : insights.rampRate < -1 ? "text-[#ff3366]" : "text-[#00ffff]"}`}>
              {insights.rampRate > 0 ? "+" : ""}
              {insights.rampRate}
            </span>
            <span className="text-sm text-[#8b7aaa]">/week</span>
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
        <div className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a]">
          <div className="text-sm text-[#8b7aaa] mb-1">Last 7 days</div>
          <div className="text-lg font-bold text-white">
            {insights.totalActivities7d}{" "}
            <span className="text-sm font-normal text-[#8b7aaa]">
              {insights.totalActivities7d === 1 ? "run" : "runs"}
            </span>
          </div>
          <div className="text-sm text-[#a78bca] mt-0.5">
            {insights.totalLoad7d} load
          </div>
        </div>
        <div className="bg-[#1a1030] rounded-lg p-3 border border-[#3d2b5a]">
          <div className="text-sm text-[#8b7aaa] mb-1">Last 28 days</div>
          <div className="text-lg font-bold text-white">
            {insights.totalActivities28d}{" "}
            <span className="text-sm font-normal text-[#8b7aaa]">runs</span>
          </div>
          <div className="text-sm text-[#a78bca] mt-0.5">
            {insights.totalLoad28d} load
          </div>
        </div>
      </div>

      {/* Explainer Toggle */}
      <button
        onClick={() => setShowExplainer((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-[#8b7aaa] hover:text-[#c4b5fd] transition-colors"
      >
        <Info className="w-4 h-4" />
        {showExplainer ? "Hide explanation" : "What do these numbers mean?"}
      </button>

      {showExplainer && (
        <div className="bg-[#1a1030] rounded-xl border border-[#3d2b5a] p-4 space-y-3 text-sm text-[#a78bca] leading-relaxed">
          <div>
            <span className="font-semibold text-[#00ffff]">Load</span> is a
            score for how hard a workout was, combining duration and intensity.
            A 30-min easy run might be 30-40, a hard interval session 80-100.
          </div>
          <div>
            <span className="font-semibold text-[#00ffff]">Fitness (CTL)</span>{" "}
            is your long-term training load — a rolling average of daily load
            over ~6 weeks. It goes up when you train consistently and drops when
            you rest. Higher = fitter.
          </div>
          <div>
            <span className="font-semibold text-[#c4b5fd]">Fatigue (ATL)</span>{" "}
            is your short-term training stress — a rolling average over ~7 days.
            It spikes after hard sessions and drops quickly with rest.
          </div>
          <div>
            <span className="font-semibold text-[#39ff14]">Form (TSB)</span> ={" "}
            Fitness minus Fatigue. When negative, you&apos;re carrying fatigue.
            When positive, you&apos;re fresh. The sweet spot for racing is
            slightly positive (+5 to +15). The sweet spot for training is
            slightly negative (-10 to -20).
          </div>
          <div>
            <span className="font-semibold text-white">Ramp Rate</span> is how
            fast your fitness is growing per week. Above 5 means you&apos;re
            increasing load quickly — higher injury risk. Between 1-4 is a solid
            build.
          </div>
        </div>
      )}
    </div>
  );
}
