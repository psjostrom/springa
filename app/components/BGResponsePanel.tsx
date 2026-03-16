"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { TrendingDown, AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { BGResponseModel, BGObservation, FuelSuggestion, CategoryBGResponse, BGBandResponse, TimeBucketResponse, TargetFuelResult, EntrySlopeResponse } from "@/lib/bgModel";
import { suggestFuelAdjustments } from "@/lib/bgModel";
import type { CalendarEvent, WorkoutCategory } from "@/lib/types";
interface BGResponsePanelProps {
  model: BGResponseModel;
  activityNames?: Map<string, string>;
  events?: CalendarEvent[];
}

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  easy: "Easy Runs",
  long: "Long Runs",
  interval: "Interval Sessions",
};

const CATEGORY_COLORS: Record<WorkoutCategory, string> = {
  easy: "var(--color-chart-secondary)",
  long: "var(--color-warning)",
  interval: "#fb923c",
};

function rateColor(rate: number): string {
  if (rate > -0.5) return "var(--color-success)"; // green — stable
  if (rate > -1.5) return "var(--color-warning)"; // yellow — moderate drop
  return "var(--color-error)"; // red — fast drop
}

function confidenceBadge(confidence: "low" | "medium" | "high") {
  const styles = {
    low: "bg-border text-muted",
    medium: "bg-tint-warning text-white",
    high: "bg-tint-success text-white",
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
    <div className="bg-surface rounded-lg border border-border p-3">
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
        <span className="text-xs text-muted">mmol/L /min</span>
      </div>

      <div className="text-xs text-muted">
        {response.sampleCount} samples · {response.activityCount} runs{response.avgFuelRate != null ? ` · ${Math.round(response.avgFuelRate)} g/h fuel` : ""}
      </div>

      {targetFuel && Math.abs(targetFuel.targetFuelRate - (targetFuel.currentAvgFuel ?? 0)) > 3 && (
        <div className="text-xs text-warning mt-1">
          Target: {targetFuel.targetFuelRate} g/h (est.)
        </div>
      )}

      {/* Expandable activity breakdown */}
      <button
        onClick={() => { setExpanded(!expanded); }}
        className="flex items-center gap-1 mt-2 text-xs text-muted hover:text-white transition-colors w-full"
      >
        <ChevronDown
          className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
        <span>{expanded ? "Hide" : "Show"} runs</span>
      </button>

      {expanded && breakdown.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          {breakdown.map((b) => (
            <div key={b.activityId} className="text-xs">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-muted truncate flex-1">{b.name}</span>
                <span
                  className="tabular-nums font-medium flex-shrink-0"
                  style={{ color: rateColor(b.avgRate) }}
                >
                  {b.avgRate > 0 ? "+" : ""}{b.avgRate.toFixed(1)}
                </span>
              </div>
              <div className="text-muted">
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
    <div className="flex items-start gap-2 bg-tint-error rounded-lg border border-error/20 p-3">
      <AlertTriangle className="w-4 h-4 text-white flex-shrink-0 mt-0.5" />
      <div className="text-sm">
        <span className="text-white font-medium">
          {CATEGORY_LABELS[suggestion.category]}:
        </span>{" "}
        <span className="text-muted">
          BG dropping {Math.abs(suggestion.avgDropRate).toFixed(2)} mmol/L/min{suggestion.currentAvgFuel != null ? ` at ${Math.round(suggestion.currentAvgFuel)} g/h` : ""}.

        </span>{" "}
        <span className="text-white font-medium">
          Try +{suggestion.suggestedIncrease} g/h.
        </span>
      </div>
    </div>
  );
}

export function BGResponsePanel({ model, activityNames }: Omit<BGResponsePanelProps, "events">) {
  const suggestions = suggestFuelAdjustments(model);
  const categoryOrder: WorkoutCategory[] = ["easy", "long", "interval"];
  const activeCategories = categoryOrder.filter((c) => model.categories[c] != null);
  const names = activityNames ?? new Map<string, string>();

  return (
    <div className="space-y-3">
      {activeCategories.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-6 text-center text-sm text-muted">
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
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted">
                <TrendingDown className="w-3.5 h-3.5" />
                Fuel Suggestions
              </div>
              {suggestions.map((s) => (
                <SuggestionCard key={s.category} suggestion={s} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function BGPatternsPanel({ events }: { events?: CalendarEvent[] }) {
  interface PatternsData {
    patterns: string | null;
    latestActivityId?: string;
  }

  const { data: patternsData } = useSWR<PatternsData>(
    "bg-patterns",
    async () => {
      const res = await fetch("/api/bg-patterns");
      if (!res.ok) return { patterns: null };
      return res.json() as Promise<PatternsData>;
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  const { trigger: discoverPatterns, isMutating: isAnalyzing, error: mutationError } = useSWRMutation<
    PatternsData,
    Error,
    string,
    CalendarEvent[]
  >(
    "bg-patterns",
    async (_key, { arg: eventsArg }) => {
      const res = await fetch("/api/bg-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: eventsArg }),
      });

      const data = (await res.json()) as { patterns?: string; latestActivityId?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Analysis failed");
      }
      // Derive latestActivityId from the events we just analyzed — guarantees
      // isStale flips false after success, preventing useEffect re-fires.
      const latest = eventsArg
        .filter((e) => e.type === "completed" && e.glucose && e.activityId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return { patterns: data.patterns ?? null, latestActivityId: latest[0]?.activityId ?? data.latestActivityId };
    },
    { populateCache: true, revalidate: false },
  );

  const patterns = patternsData?.patterns ?? null;
  const savedLatestActivityId = patternsData?.latestActivityId ?? null;

  const canDiscover = events && events.filter((e) => e.type === "completed" && e.glucose).length >= 5;

  const latestCompletedActivityId = (() => {
    if (!events) return null;
    const withGlucose = events
      .filter((e) => e.type === "completed" && e.glucose && e.activityId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return withGlucose[0]?.activityId ?? null;
  })();

  const isStale = patterns != null
    && savedLatestActivityId != null
    && latestCompletedActivityId != null
    && savedLatestActivityId !== latestCompletedActivityId;

  const handleDiscover = () => {
    if (!events || isAnalyzing) return;
    void discoverPatterns(events).catch(() => { /* handled by mutationError state */ });
  };

  useEffect(() => {
    if (isStale && !isAnalyzing && !mutationError && events) {
      void discoverPatterns(events).catch(() => { /* handled by mutationError state */ });
    }
  }, [isStale, isAnalyzing, mutationError, discoverPatterns, events]);

  const patternsError = mutationError?.message ?? null;

  if (!patterns && !isAnalyzing && !canDiscover) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="flex-1" />
        {canDiscover && !isAnalyzing && !patterns && (
          <button
            onClick={handleDiscover}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition bg-border text-muted hover:text-brand hover:bg-border border border-border"
          >
            Discover Patterns
          </button>
        )}
        {!isAnalyzing && patterns && (
          <button
            onClick={handleDiscover}
            disabled={!canDiscover}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition bg-border text-muted hover:text-brand hover:bg-border border border-border disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Re-analyze
          </button>
        )}
      </div>

      <div className="bg-surface rounded-lg border border-border p-4">
        {isAnalyzing ? (
          <div className="flex items-center justify-center py-4 text-muted">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">
              Analyzing patterns across {events?.filter((e) => e.type === "completed" && e.glucose).length ?? 0} runs...
            </span>
          </div>
        ) : patternsError ? (
          <div className="text-sm text-error">{patternsError}</div>
        ) : patterns ? (
          <div className="text-sm text-muted leading-relaxed prose-patterns">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{patterns}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-sm text-muted text-center py-2">
            Click &quot;Discover Patterns&quot; to analyze cross-run trends
          </div>
        )}
      </div>
    </div>
  );
}

export function StartingBGSection({ bands }: { bands: BGBandResponse[] }) {
  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {bands.map((b) => (
          <div
            key={b.band}
            className="flex items-center justify-between px-3 py-2 border-b border-border last:border-b-0"
          >
            <span className="text-xs text-muted w-12">{b.band}</span>
            <span
              className="text-sm font-bold tabular-nums flex-1 text-right"
              style={{ color: rateColor(b.avgRate) }}
            >
              {b.avgRate > 0 ? "+" : ""}{b.avgRate.toFixed(1)}
            </span>
            <span className="text-xs text-muted w-16 text-right">
              {b.sampleCount} obs
            </span>
          </div>
        ))}
    </div>
  );
}

const SLOPE_LABELS: Record<string, string> = {
  crashing: "Crashing",
  dropping: "Dropping",
  stable: "Stable",
  rising: "Rising",
};

export function EntrySlopeSection({ slopes }: { slopes: EntrySlopeResponse[] }) {
  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {slopes.map((s) => (
          <div
            key={s.slope}
            className="flex items-center justify-between px-3 py-2 border-b border-border last:border-b-0"
          >
            <span className="text-xs text-muted w-16">{SLOPE_LABELS[s.slope] ?? s.slope}</span>
            <span
              className="text-sm font-bold tabular-nums flex-1 text-right"
              style={{ color: rateColor(s.avgRate) }}
            >
              {s.avgRate > 0 ? "+" : ""}{s.avgRate.toFixed(1)}
            </span>
            <span className="text-xs text-muted w-16 text-right">
              {s.sampleCount} obs
            </span>
          </div>
        ))}
    </div>
  );
}

export function TimeDecaySection({ buckets }: { buckets: TimeBucketResponse[] }) {
  const maxRate = Math.max(...buckets.map((b) => Math.abs(b.avgRate)), 0.1);

  return (
    <div className="bg-surface rounded-lg border border-border p-3 space-y-2">
        {buckets.map((b) => {
          const barWidth = (Math.abs(b.avgRate) / maxRate) * 100;
          return (
            <div key={b.bucket} className="flex items-center gap-2">
              <span className="text-xs text-muted w-10 flex-shrink-0">{b.bucket}</span>
              <div className="flex-1 h-4 bg-surface rounded overflow-hidden">
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
  );
}
