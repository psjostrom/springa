"use client";

import { useState } from "react";
import { Droplets, TrendingDown, AlertTriangle, ChevronDown } from "lucide-react";
import type { BGResponseModel, BGObservation, FuelSuggestion, CategoryBGResponse, BGBandResponse, TimeBucketResponse, TargetFuelResult } from "@/lib/bgModel";
import { suggestFuelAdjustments } from "@/lib/bgModel";
import type { WorkoutCategory } from "@/lib/types";

interface BGResponsePanelProps {
  model: BGResponseModel;
  activityNames?: Map<string, string>;
}

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  easy: "Easy Runs",
  long: "Long Runs",
  interval: "Interval Sessions",
};

const CATEGORY_COLORS: Record<WorkoutCategory, string> = {
  easy: "#06b6d4",
  long: "#fbbf24",
  interval: "#fb923c",
};

function rateColor(rate: number): string {
  if (rate > -0.5) return "#39ff14"; // green — stable
  if (rate > -1.5) return "#fbbf24"; // yellow — moderate drop
  return "#ff3366"; // red — fast drop
}

function confidenceBadge(confidence: "low" | "medium" | "high") {
  const styles = {
    low: "bg-[#3d2b5a] text-[#b8a5d4]",
    medium: "bg-[#3d2b1a] text-[#ffb800]",
    high: "bg-[#1a3d25] text-[#39ff14]",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${styles[confidence]}`}>
      {confidence}
    </span>
  );
}

interface ActivityBreakdown {
  activityId: string;
  name: string;
  sampleCount: number;
  avgRate: number;
  fuelRate: number | null;
}

function buildActivityBreakdown(
  observations: BGObservation[],
  category: WorkoutCategory,
  activityNames: Map<string, string>,
): ActivityBreakdown[] {
  const catObs = observations.filter((o) => o.category === category);
  const byActivity = new Map<string, BGObservation[]>();

  for (const obs of catObs) {
    const list = byActivity.get(obs.activityId) ?? [];
    list.push(obs);
    byActivity.set(obs.activityId, list);
  }

  const breakdowns: ActivityBreakdown[] = [];
  for (const [activityId, obs] of byActivity) {
    const rates = obs.map((o) => o.bgRate);
    breakdowns.push({
      activityId,
      name: activityNames.get(activityId) ?? activityId,
      sampleCount: obs.length,
      avgRate: rates.reduce((a, b) => a + b, 0) / rates.length,
      fuelRate: obs[0].fuelRate,
    });
  }

  return breakdowns.sort((a, b) => b.sampleCount - a.sampleCount);
}

function CategoryCard({
  response,
  observations,
  activityNames,
  targetFuel,
}: {
  response: CategoryBGResponse;
  observations: BGObservation[];
  activityNames: Map<string, string>;
  targetFuel?: TargetFuelResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = CATEGORY_COLORS[response.category];
  const rate = response.avgRate;
  const breakdown = expanded
    ? buildActivityBreakdown(observations, response.category, activityNames)
    : [];

  return (
    <div className="bg-[#1e1535] rounded-lg border border-[#3d2b5a] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color }}>
          {CATEGORY_LABELS[response.category]}
        </span>
        {confidenceBadge(response.confidence)}
      </div>

      <div className="flex items-baseline gap-1 mb-1">
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color: rateColor(rate) }}
        >
          {rate > 0 ? "+" : ""}{rate.toFixed(1)}
        </span>
        <span className="text-xs text-[#b8a5d4]">mmol/L /10m</span>
      </div>

      <div className="text-xs text-[#8b7ba8]">
        {response.sampleCount} samples · {response.activityCount} runs{response.avgFuelRate != null ? ` · ${Math.round(response.avgFuelRate)} g/h fuel` : ""}
      </div>

      {targetFuel && Math.abs(targetFuel.targetFuelRate - (targetFuel.currentAvgFuel ?? 0)) > 3 && (
        <div className="text-xs text-[#fbbf24] mt-1">
          Target: {targetFuel.targetFuelRate} g/h (est.)
        </div>
      )}

      {/* Expandable activity breakdown */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 mt-2 text-xs text-[#8b7ba8] hover:text-[#c4b5fd] transition-colors w-full"
      >
        <ChevronDown
          className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
        <span>{expanded ? "Hide" : "Show"} runs</span>
      </button>

      {expanded && breakdown.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-[#3d2b5a] pt-2">
          {breakdown.map((b) => (
            <div key={b.activityId} className="text-xs">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[#c4b5fd] truncate flex-1">{b.name}</span>
                <span
                  className="tabular-nums font-medium flex-shrink-0"
                  style={{ color: rateColor(b.avgRate) }}
                >
                  {b.avgRate > 0 ? "+" : ""}{b.avgRate.toFixed(1)}
                </span>
              </div>
              <div className="text-[#8b7ba8]">
                {b.sampleCount} samples{b.fuelRate != null ? ` · ${Math.round(b.fuelRate)} g/h` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: FuelSuggestion }) {
  return (
    <div className="flex items-start gap-2 bg-[#3d1525] rounded-lg border border-[#ff3366]/20 p-3">
      <AlertTriangle className="w-4 h-4 text-[#ff3366] flex-shrink-0 mt-0.5" />
      <div className="text-sm">
        <span className="text-[#ff3366] font-medium">
          {CATEGORY_LABELS[suggestion.category]}:
        </span>{" "}
        <span className="text-[#e0d0f0]">
          BG dropping {Math.abs(suggestion.avgDropRate).toFixed(1)} mmol/L/10m{suggestion.currentAvgFuel != null ? ` at ${Math.round(suggestion.currentAvgFuel)} g/h` : ""}.
        </span>{" "}
        <span className="text-[#fbbf24]">
          Try +{suggestion.suggestedIncrease} g/h.
        </span>
      </div>
    </div>
  );
}

export function BGResponsePanel({ model, activityNames }: BGResponsePanelProps) {
  const suggestions = suggestFuelAdjustments(model);
  const categoryOrder: WorkoutCategory[] = ["easy", "long", "interval"];
  const activeCategories = categoryOrder.filter((c) => model.categories[c] != null);
  const names = activityNames ?? new Map<string, string>();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-[#06b6d4]" />
          <span className="text-sm font-semibold uppercase text-[#b8a5d4]">
            BG Response by Workout
          </span>
        </div>
        <span className="text-xs text-[#8b7ba8]">
          {model.activitiesAnalyzed} runs analyzed
        </span>
      </div>

      {activeCategories.length === 0 ? (
        <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-6 text-center text-sm text-[#8b7ba8]">
          No runs with both HR and glucose data found.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {categoryOrder.map((cat) => {
              const response = model.categories[cat];
              if (!response) return null;
              const targetFuel = model.targetFuelRates.find((t) => t.category === cat);
              return (
                <CategoryCard
                  key={cat}
                  response={response}
                  observations={model.observations}
                  activityNames={names}
                  targetFuel={targetFuel}
                />
              );
            })}
          </div>

          {suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-[#b8a5d4]">
                <TrendingDown className="w-3.5 h-3.5" />
                Fuel Suggestions
              </div>
              {suggestions.map((s) => (
                <SuggestionCard key={s.category} suggestion={s} />
              ))}
            </div>
          )}

          {model.bgByStartLevel.length > 0 && (
            <StartingBGSection bands={model.bgByStartLevel} />
          )}

          {model.bgByTime.length > 0 && (
            <TimeDecaySection buckets={model.bgByTime} />
          )}
        </>
      )}
    </div>
  );
}

function StartingBGSection({ bands }: { bands: BGBandResponse[] }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase text-[#b8a5d4]">
        BG Drop by Start Level
      </div>
      <div className="bg-[#1e1535] rounded-lg border border-[#3d2b5a] overflow-hidden">
        {bands.map((b) => (
          <div
            key={b.band}
            className="flex items-center justify-between px-3 py-2 border-b border-[#3d2b5a] last:border-b-0"
          >
            <span className="text-xs text-[#c4b5fd] w-12">{b.band}</span>
            <span
              className="text-sm font-bold tabular-nums flex-1 text-right"
              style={{ color: rateColor(b.avgRate) }}
            >
              {b.avgRate > 0 ? "+" : ""}{b.avgRate.toFixed(1)}
            </span>
            <span className="text-xs text-[#8b7ba8] w-16 text-right">
              {b.sampleCount} obs
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeDecaySection({ buckets }: { buckets: TimeBucketResponse[] }) {
  const maxRate = Math.max(...buckets.map((b) => Math.abs(b.avgRate)), 0.1);

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase text-[#b8a5d4]">
        BG Drop Over Time
      </div>
      <div className="bg-[#1e1535] rounded-lg border border-[#3d2b5a] p-3 space-y-2">
        {buckets.map((b) => {
          const barWidth = (Math.abs(b.avgRate) / maxRate) * 100;
          return (
            <div key={b.bucket} className="flex items-center gap-2">
              <span className="text-xs text-[#c4b5fd] w-10 flex-shrink-0">{b.bucket}</span>
              <div className="flex-1 h-4 bg-[#2a1f45] rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: rateColor(b.avgRate),
                  }}
                />
              </div>
              <span
                className="text-xs font-bold tabular-nums w-10 text-right flex-shrink-0"
                style={{ color: rateColor(b.avgRate) }}
              >
                {b.avgRate > 0 ? "+" : ""}{b.avgRate.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
