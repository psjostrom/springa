"use client";

import type { WorkoutCategory } from "@/lib/types";
import { WORKOUT_CATEGORY_LABEL } from "@/lib/workoutLabels";

export interface AfterStats {
  runCount: number;
  medianRebound: number; // mmol/L typical 60min peak rebound
  bigReboundCount: number; // peak60mAboveEnd > 2.0
  lateHypoCount: number;
}

interface Props {
  stats: Record<WorkoutCategory, AfterStats | null>;
}

const LEVER_LINES: Record<WorkoutCategory, string> = {
  long: "reduce the rebound (reconnect pump earlier, smaller recovery carb) and the correction bolus shrinks — likely cuts the late hypo with it.",
  interval:
    "intervals tend to spike from hormones — small correction works better than big.",
  easy: "if a late hypo happens here it's usually the run already ended low — pre-fuel matters more than recovery here.",
};

export function AfterPatternCards({ stats }: Props) {
  const ordered = (
    Object.entries(stats) as [WorkoutCategory, AfterStats | null][]
  )
    .filter((entry): entry is [WorkoutCategory, AfterStats] => entry[1] != null)
    .sort(
      ([, a], [, b]) =>
        b.bigReboundCount / Math.max(b.runCount, 1) -
        a.bigReboundCount / Math.max(a.runCount, 1),
    );

  return (
    <div className="space-y-2">
      {ordered.map(([cat, s], i) => (
        <Card key={cat} cat={cat} stats={s} isDominant={i === 0} />
      ))}
    </div>
  );
}

function Card({
  cat,
  stats,
  isDominant,
}: {
  cat: WorkoutCategory;
  stats: AfterStats;
  isDominant: boolean;
}) {
  return (
    <div
      role="region"
      aria-label={WORKOUT_CATEGORY_LABEL[cat]}
      data-testid={`after-card-${cat}`}
      className={`bg-surface border rounded-xl p-3 ${isDominant ? "border-warning/40" : "border-border"}`}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold">
          {WORKOUT_CATEGORY_LABEL[cat]}
        </span>
        <span className="text-xs text-muted">{stats.runCount} run{stats.runCount === 1 ? "" : "s"}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-extrabold text-warning tabular-nums">
          +{stats.medianRebound.toFixed(1)}
        </span>
        <span className="text-xs text-muted">
          typical 60m rebound (mmol/L)
        </span>
      </div>
      <div className="bg-surface-alt rounded-lg p-2.5">
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <ChainStep variant="cause">
            {stats.bigReboundCount}/{stats.runCount} rebound
          </ChainStep>
          <span className="text-muted">→</span>
          <ChainStep variant="action">bolus</ChainStep>
          <span className="text-muted">→</span>
          <ChainStep variant="effect">
            {stats.lateHypoCount}/{stats.runCount} late hypo
          </ChainStep>
        </div>
        {isDominant && (
          <div className="text-xs text-muted mt-2 pt-2 border-t border-dashed border-border">
            <strong className="text-text">Lever:</strong> {LEVER_LINES[cat]}
          </div>
        )}
      </div>
    </div>
  );
}

function ChainStep({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: "cause" | "action" | "effect";
}) {
  const cls =
    variant === "cause"
      ? "text-warning border-warning/30"
      : variant === "effect"
        ? "text-error border-error/30"
        : "text-muted border-border";
  return (
    <span className={`px-1.5 py-0.5 rounded border bg-bg ${cls}`}>
      {children}
    </span>
  );
}
