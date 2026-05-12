"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { WorkoutCategory } from "@/lib/types";
import type { PredictedOutcome } from "@/lib/runOutcomePrediction";
import type { FuelRecommendation } from "@/lib/fuelRecommendation";
import type { PredictorName } from "@/lib/intelScreenData";
import { WORKOUT_CATEGORY_LABEL } from "@/lib/workoutLabels";

export interface TomorrowMatchSummary {
  activityId: string;
  date: string;
  startBG: number;
  endBG: number;
  fuelRate: number | null;
}

export interface TomorrowWorkoutSummary {
  name: string;
  date: string; // ISO yyyy-MM-dd
  timeOfDay: string; // e.g. "06:30"
  category: WorkoutCategory;
  durationMin: number;
  distanceKm: number;
  targetHRRange: string;
}

interface Props {
  workout: TomorrowWorkoutSummary;
  recommendation: FuelRecommendation | null;
  prediction: PredictedOutcome | null;
  matches: TomorrowMatchSummary[];
  matchPredictors: PredictorName[];
  matchRelaxed: boolean;
}

const HYPO = 4.0;

// Per-variant scales. End BG (during) clusters 4-10 with safety zones, so a
// fixed 3.5-14 scale lets the gradient mean the same thing across runs.
// Peak BG (after) routinely exceeds 14 (post-run rebounds of 4-8 mmol/L on
// top of an end BG of 7-10), so it gets a wider scale to avoid clamping
// values into the right edge.
const SCALES: Record<"during" | "after", { min: number; max: number }> = {
  during: { min: 3.5, max: 14.0 },
  after: { min: 4.0, max: 20.0 },
};

const LABEL_COLORS: Record<"during" | "after", { low: string; typical: string; high: string }> = {
  during: { low: "text-error", typical: "text-text font-bold", high: "text-muted" },
  after: { low: "text-muted", typical: "text-text font-bold", high: "text-error" },
};

const PREDICTOR_LABELS: Record<PredictorName, string> = {
  startBG: "starting BG",
  entrySlope: "entry trend",
  fuelRate: "fuel rate",
  timeOfDay: "time of day",
};

const LEVER_LINES: Record<WorkoutCategory, string> = {
  long: "Reconnect pump within 5 min of stop · skip post-run quick carbs · wait 30 min before correction bolus.",
  interval:
    "Reconnect pump within 5 min of stop · skip post-run quick carbs · wait 30 min before correction bolus to let exercise effect finish.",
  easy: "Reconnect pump within 5 min of stop · keep recovery snack small · let the exercise effect finish before correcting.",
};

function pctOnScale(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function parseLocalDate(dateIso: string): Date {
  // dateIso is yyyy-MM-dd; treat as local midnight for display.
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatHeader(dateIso: string, timeOfDay: string): string {
  return `${format(parseLocalDate(dateIso), "EEE · MMM d").toUpperCase()} · ${timeOfDay}`;
}

function formatMatchDate(dateIso: string): string {
  return format(parseLocalDate(dateIso), "MMM d");
}

function formatPredictorList(predictors: PredictorName[]): string {
  if (predictors.length === 0) return "";
  const labels = predictors.map((p) => PREDICTOR_LABELS[p]);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function TomorrowCard({
  workout,
  recommendation,
  prediction,
  matches,
  matchPredictors,
  matchRelaxed,
}: Props) {
  const [matchesOpen, setMatchesOpen] = useState(false);

  // Three different counts can diverge silently: post-context filtering reduces
  // prediction.during.matchCount below matches.length, and
  // recommendation.matchCountAtRate is a per-fuel-rate subset of that. Surface
  // the gap rather than render three numbers in three places.
  const predictionMatchCount = prediction?.during.matchCount ?? 0;
  const totalMatches = matches.length;
  const showsPostGap = totalMatches > predictionMatchCount;

  return (
    <div
      data-testid="tomorrow-card"
      className="bg-surface border border-border-subtle rounded-2xl p-4 mb-3 bg-gradient-to-b from-brand/5 to-transparent"
    >
      {/* HEADER */}
      <div className="flex justify-between items-center text-[11px] uppercase tracking-wider text-muted font-bold">
        <span>{formatHeader(workout.date, workout.timeOfDay)}</span>
        <span>{WORKOUT_CATEGORY_LABEL[workout.category].toUpperCase()}</span>
      </div>
      <div className="mt-1 text-base font-bold text-text">{workout.name}</div>
      <div className="text-xs text-muted">
        ~{workout.durationMin} min · {workout.distanceKm} km · target HR {workout.targetHRRange}
      </div>

      {/* DURING */}
      <PhaseSection label="DURING" dotColor="bg-brand">
        {prediction ? (
          <>
            {recommendation ? (
              <FuelHeadline
                value={String(recommendation.fuelRate)}
                unit="g/h"
                meta={`${recommendation.matchCountAtRate} run${recommendation.matchCountAtRate === 1 ? "" : "s"} at ${recommendation.fuelRate} g/h · ${prediction.during.confidence} overall`}
              />
            ) : (
              <div className="text-xs text-muted py-2">
                No fuel rate recorded for these matches — based on {predictionMatchCount} run{predictionMatchCount === 1 ? "" : "s"} without fuel data.
              </div>
            )}

            <Ribbon
              label={
                recommendation
                  ? `Predicted end BG · typical ${WORKOUT_CATEGORY_LABEL[workout.category]} at ${recommendation.fuelRate} g/h`
                  : `Predicted end BG · typical ${WORKOUT_CATEGORY_LABEL[workout.category]}`
              }
              p10={prediction.during.p10EndBG}
              median={prediction.during.medianEndBG}
              p90={prediction.during.p90EndBG}
              variant="during"
            />

            <p className="text-xs text-text mt-3 leading-snug">
              <strong>{prediction.during.hypoCount} of {predictionMatchCount}</strong>{" "}
              matching past run{predictionMatchCount === 1 ? "" : "s"} ended below 4.0.
              {recommendation && (
                <> The recommended rate keeps the predicted 10th percentile end BG at {recommendation.predictedP10EndBG.toFixed(1)}.</>
              )}
            </p>

            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  setMatchesOpen((o) => !o);
                }}
                className="text-xs text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded"
                aria-expanded={matchesOpen}
              >
                {matchesOpen ? "Hide" : "Show"} {predictionMatchCount} matching run{predictionMatchCount === 1 ? "" : "s"}
              </button>

              {matchPredictors.length > 0 && !matchRelaxed && (
                <span className="ml-2 text-[11px] text-muted">
                  Matched on similar {formatPredictorList(matchPredictors)}.
                </span>
              )}

              {matchRelaxed && (
                <span className="ml-2 text-[11px] text-muted">
                  Matched on category only — relaxed soft filters to find enough runs.
                </span>
              )}
            </div>

            {showsPostGap && (
              <p className="text-[11px] text-muted mt-1 leading-snug">
                Showing {totalMatches} match{totalMatches === 1 ? "" : "es"}; {predictionMatchCount} {predictionMatchCount === 1 ? "has" : "have"} post-run data used for predictions.
              </p>
            )}

            {matchesOpen && matches.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {matches.map((m) => (
                  <li
                    key={m.activityId}
                    className="flex justify-between items-center bg-surface-alt rounded-md px-2 py-1.5"
                  >
                    <span className="text-muted tabular-nums">{formatMatchDate(m.date)}</span>
                    <span className="tabular-nums">
                      <span className="text-muted">start</span>{" "}
                      <strong>{m.startBG.toFixed(1)}</strong>
                      <span className="mx-1 text-muted">→</span>
                      <span className="text-muted">end</span>{" "}
                      <strong className={m.endBG < HYPO ? "text-error" : ""}>
                        {m.endBG.toFixed(1)}
                      </strong>
                    </span>
                    <span className="text-muted tabular-nums">
                      {m.fuelRate != null ? `${m.fuelRate}g/h` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="text-xs text-muted py-2">
            No matching history yet — log a few {WORKOUT_CATEGORY_LABEL[workout.category].toLowerCase()} runs and predictions will appear here.
          </div>
        )}
      </PhaseSection>

      {/* AFTER */}
      <PhaseSection label="AFTER · 2H POST-RUN" dotColor="bg-warning">
        {prediction ? (
          <>
            <FuelHeadline
              value={`+${prediction.after.medianRebound.toFixed(1)}`}
              unit="mmol/L typical peak"
              meta={`${prediction.after.matchCount} past ${WORKOUT_CATEGORY_LABEL[workout.category]}${prediction.after.matchCount === 1 ? "" : "s"} · range +${prediction.after.p10Rebound.toFixed(1)} to +${prediction.after.p90Rebound.toFixed(1)}`}
              valueClass="text-warning"
            />

            <Ribbon
              label="Predicted peak BG within one hour"
              p10={prediction.after.p10PeakBG}
              median={prediction.after.medianPeakBG}
              p90={prediction.after.p90PeakBG}
              variant="after"
            />

            <p className="text-xs text-text mt-3 leading-snug">
              <strong>
                {prediction.after.bigReboundCount} of {prediction.after.matchCount}
              </strong>{" "}
              recent {WORKOUT_CATEGORY_LABEL[workout.category]}{prediction.after.matchCount === 1 ? "" : "s"} rebounded &gt; +2.0 mmol/L within one hour.{" "}
              <strong>Likely chain:</strong> rebound → correction bolus →{" "}
              {prediction.after.lateHypoCount} of {prediction.after.matchCount} late-hypo within 2 h.
            </p>
            <p className="text-xs text-text mt-2 leading-snug">
              <strong>Levers:</strong> {LEVER_LINES[workout.category]}
            </p>
          </>
        ) : (
          <div className="text-xs text-muted py-2">
            No matching history yet — predictions for the after phase will appear once enough {WORKOUT_CATEGORY_LABEL[workout.category].toLowerCase()} runs are logged.
          </div>
        )}
      </PhaseSection>
    </div>
  );
}

function PhaseSection({
  label,
  dotColor,
  children,
}: {
  label: string;
  dotColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 pt-3 border-t border-border first-of-type:border-t-0 first-of-type:pt-1 first-of-type:mt-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted font-bold mb-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
        {label}
      </div>
      {children}
    </div>
  );
}

function FuelHeadline({
  value,
  unit,
  meta,
  valueClass,
}: {
  value: string;
  unit: string;
  meta: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className={`text-3xl font-extrabold tabular-nums ${valueClass ?? "text-text"}`}>
        {value}
      </span>
      <span className="text-xs text-muted">{unit}</span>
      <span className="text-xs text-muted ml-auto">{meta}</span>
    </div>
  );
}

function Ribbon({
  label,
  p10,
  median,
  p90,
  variant,
}: {
  label: string;
  p10: number;
  median: number;
  p90: number;
  variant: "during" | "after";
}) {
  const { min, max } = SCALES[variant];
  const p10Pct = pctOnScale(p10, min, max);
  const medianPct = pctOnScale(median, min, max);
  const p90Pct = pctOnScale(p90, min, max);
  const gradient =
    variant === "during"
      ? "bg-gradient-to-r from-error/20 via-success/15 to-warning/20"
      : "bg-gradient-to-r from-success/15 via-warning/20 to-error/20";

  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-widest text-muted font-bold mb-1.5">
        {label}
      </div>
      <div className={`relative h-6 rounded-md ${gradient} border border-border-subtle`}>
        <div
          className="absolute top-1 bottom-1 bg-text/15 rounded-sm"
          style={{ left: `${p10Pct}%`, right: `${100 - p90Pct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-text"
          style={{ left: `${medianPct}%` }}
          aria-hidden
        />
      </div>
      {/* Labels positioned at their data values so each label sits directly
          under the visual element it names (low → pill left edge, typical →
          line, high → pill right edge). */}
      <div className="relative h-4 mt-1 text-[10px] tabular-nums">
        <RibbonLabel testid={`ribbon-${variant}-low`}     pct={p10Pct}     valueClass={LABEL_COLORS[variant].low}     prefix="low"     value={p10} />
        <RibbonLabel testid={`ribbon-${variant}-typical`} pct={medianPct}  valueClass={LABEL_COLORS[variant].typical} prefix="typical" value={median} />
        <RibbonLabel testid={`ribbon-${variant}-high`}    pct={p90Pct}     valueClass={LABEL_COLORS[variant].high}    prefix="high"    value={p90} />
      </div>
    </div>
  );
}

/**
 * Position a label under the bar at the given percentage. Center-aligns at the
 * value position, but anchors flush left/right when the value is near an edge
 * so the label never overflows the bar.
 */
function RibbonLabel({
  pct,
  valueClass,
  prefix,
  value,
  testid,
}: {
  pct: number;
  valueClass: string;
  prefix: string;
  value: number;
  testid?: string;
}) {
  const style: React.CSSProperties =
    pct < 8
      ? { left: 0 }
      : pct > 92
      ? { right: 0 }
      : { left: `${pct}%`, transform: "translateX(-50%)" };
  return (
    <span data-testid={testid} className={`absolute whitespace-nowrap ${valueClass}`} style={style}>
      <span className="text-muted font-normal">{prefix} </span>
      {value.toFixed(1)}
    </span>
  );
}
