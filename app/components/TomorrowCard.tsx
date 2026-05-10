"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { WorkoutCategory } from "@/lib/types";
import type { PredictedOutcome } from "@/lib/runOutcomePrediction";
import type { FuelRecommendation } from "@/lib/fuelRecommendation";
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
  /** null when no live CGM reading is available; we render a fallback label. */
  currentBG: number | null;
  /** "live" = real CGM reading, "fallback" = matched against typical 8.0 mmol/L. */
  currentBGSource: "live" | "fallback";
  recommendation: FuelRecommendation | null;
  prediction: PredictedOutcome | null;
  matches: TomorrowMatchSummary[];
}

const FALLBACK_START_BG = 8.0;

const HYPO = 4.0;
const MIN = 3.5;
const MAX = 14.0;
const SPAN = MAX - MIN;

const LEVER_LINES: Record<WorkoutCategory, string> = {
  long: "Reconnect pump within 5 min of stop · skip post-run quick carbs · wait 30 min before correction bolus.",
  interval:
    "Reconnect pump within 5 min of stop · skip post-run quick carbs · wait 30 min before correction bolus to let exercise effect finish.",
  easy: "Reconnect pump within 5 min of stop · keep recovery snack small · let the exercise effect finish before correcting.",
};

function pct(value: number): number {
  return Math.max(0, Math.min(100, ((value - MIN) / SPAN) * 100));
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

export function TomorrowCard({
  workout,
  currentBG,
  currentBGSource,
  recommendation,
  prediction,
  matches,
}: Props) {
  const [matchesOpen, setMatchesOpen] = useState(false);
  const liveBG = currentBGSource === "live" && currentBG != null ? currentBG : null;
  // The matching engine targets 8.0 mmol/L when no live reading exists.
  const ribbonStartBG = liveBG ?? FALLBACK_START_BG;
  const bgMeta =
    liveBG == null
      ? `no live BG · matching against typical ${FALLBACK_START_BG.toFixed(1)} mmol/L start`
      : `current BG ${liveBG.toFixed(1)}`;

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
        ~{workout.durationMin} min · {workout.distanceKm} km · target HR {workout.targetHRRange} · {bgMeta}
      </div>

      {/* DURING */}
      <PhaseSection label="DURING" dotColor="bg-brand">
        {prediction ? (
          <>
            {recommendation ? (
              <FuelHeadline
                value={String(recommendation.fuelRate)}
                unit="g/h"
                meta={`${recommendation.matchCountAtRate} runs at ${recommendation.fuelRate} g/h · ${prediction.during.confidence} overall`}
              />
            ) : (
              <div className="text-xs text-muted py-2">
                No fuel rate recorded for these matches — based on {predictionMatchCount} runs without fuel data.
              </div>
            )}

            <Ribbon
              label={`Predicted end BG · starting at ${ribbonStartBG.toFixed(1)}`}
              p10={prediction.during.p10EndBG}
              median={prediction.during.medianEndBG}
              p90={prediction.during.p90EndBG}
              variant="during"
            />

            <p className="text-xs text-text mt-3 leading-snug">
              <strong>{prediction.during.hypoCount} of {predictionMatchCount}</strong>{" "}
              matching past runs ended below 4.0.
              {recommendation && (
                <> The recommended rate keeps the predicted 10th percentile end BG at {recommendation.predictedP10EndBG.toFixed(1)}.</>
              )}
            </p>

            <button
              type="button"
              onClick={() => {
                setMatchesOpen((o) => !o);
              }}
              className="mt-2 text-xs text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded"
              aria-expanded={matchesOpen}
            >
              {matchesOpen ? "Hide" : "Show"} {predictionMatchCount} matching runs
            </button>

            {showsPostGap && (
              <p className="text-[11px] text-muted mt-1 leading-snug">
                Showing {totalMatches} matches; {predictionMatchCount} have post-run data used for predictions.
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
            No matching history yet — log a few interval runs and predictions will appear here.
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
              meta={`${prediction.after.matchCount} past ${WORKOUT_CATEGORY_LABEL[workout.category]}s · range +${prediction.after.p10Rebound.toFixed(1)} to +${prediction.after.p90Rebound.toFixed(1)}`}
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
              recent {WORKOUT_CATEGORY_LABEL[workout.category]}s rebounded &gt; +2.0 mmol/L within one hour.{" "}
              <strong>Likely chain:</strong> rebound → correction bolus →{" "}
              {prediction.after.lateHypoCount} of {prediction.after.matchCount} late-hypo within 2 h.
            </p>
            <p className="text-xs text-text mt-2 leading-snug">
              <strong>Levers:</strong> {LEVER_LINES[workout.category]}
            </p>
          </>
        ) : (
          <div className="text-xs text-muted py-2">
            No matching history yet — predictions for the after phase will appear once enough runs are logged.
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
  const leftPct = pct(p10);
  const rightPct = 100 - pct(p90);
  const medianPct = pct(median);
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
          style={{ left: `${leftPct}%`, right: `${rightPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-text"
          style={{ left: `${medianPct}%` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted mt-1 tabular-nums">
        <span className="text-error">{p10.toFixed(1)}</span>
        <span className="text-text font-bold">{median.toFixed(1)}</span>
        <span>{p90.toFixed(1)}</span>
      </div>
    </div>
  );
}
