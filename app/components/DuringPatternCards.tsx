"use client";

import type { WorkoutCategory } from "@/lib/types";
import { WORKOUT_CATEGORY_LABEL } from "@/lib/workoutLabels";

export interface CategoryStats {
  runCount: number;
  medianEndBG: number;
  endBGs: number[];
  hypoCount: number;
  avgDropPerHr: number;
}

interface Props {
  stats: Record<WorkoutCategory, CategoryStats | null>;
}

const NAME_COLOR: Record<WorkoutCategory, string> = {
  easy: "text-[var(--theme-chart-secondary)]",
  long: "text-warning",
  interval: "text-warning",
};

const HYPO = 4.0;
const HIGH = 10.0;
const MIN = 3.5;
const MAX = 14.0;
const SPAN = MAX - MIN;

export function DuringPatternCards({ stats }: Props) {
  const ordered = (Object.entries(stats) as [WorkoutCategory, CategoryStats | null][])
    .filter((entry): entry is [WorkoutCategory, CategoryStats] => entry[1] != null)
    .sort(
      ([, a], [, b]) =>
        b.hypoCount / Math.max(b.runCount, 1) - a.hypoCount / Math.max(a.runCount, 1),
    );

  return (
    <div className="space-y-2">
      {ordered.map(([cat, s], i) => (
        <Card key={cat} cat={cat} stats={s} isWorst={i === 0} />
      ))}
    </div>
  );
}

function Card({
  cat,
  stats,
  isWorst,
}: {
  cat: WorkoutCategory;
  stats: CategoryStats;
  isWorst: boolean;
}) {
  const hypoPct = Math.round((stats.hypoCount / stats.runCount) * 100);
  return (
    <div
      role="region"
      aria-label={WORKOUT_CATEGORY_LABEL[cat]}
      data-testid={`during-card-${cat}`}
      className={`bg-surface border rounded-xl p-3 ${isWorst && hypoPct >= 5 ? "border-error/40" : "border-border"}`}
    >
      <div className="flex justify-between items-center mb-2">
        <span data-testid="during-card-name" className={`text-sm font-bold ${NAME_COLOR[cat]}`}>
          {WORKOUT_CATEGORY_LABEL[cat]}
        </span>
        <span className="text-xs text-muted">{stats.runCount} run{stats.runCount === 1 ? "" : "s"}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tabular-nums">{stats.medianEndBG.toFixed(1)}</span>
        <span className="text-xs text-muted">typical end BG (mmol/L)</span>
      </div>
      <DotStrip endBGs={stats.endBGs} />
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Tile
          label="Hypo runs (min < 4.0)"
          value={`${stats.hypoCount} of ${stats.runCount} · ${hypoPct}%`}
          danger={hypoPct >= 10}
        />
        <Tile label="Avg drop" value={`${stats.avgDropPerHr.toFixed(1)} mmol/hr`} />
      </div>
    </div>
  );
}

function DotStrip({ endBGs }: { endBGs: number[] }) {
  const hypoEnd = ((HYPO - MIN) / SPAN) * 100;
  const highStart = ((HIGH - MIN) / SPAN) * 100;
  return (
    <div className="relative h-7 my-2">
      <div className="absolute top-1 bottom-0 left-0 bg-error opacity-20" style={{ width: `${hypoEnd}%` }} />
      <div
        className="absolute top-1 bottom-0 right-0 bg-warning opacity-20"
        style={{ width: `${100 - highStart}%` }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-border-subtle" />
      {endBGs.map((bg, i) => {
        const left = Math.max(0, Math.min(100, ((bg - MIN) / SPAN) * 100));
        const color = bg < HYPO ? "bg-error" : bg > HIGH ? "bg-warning" : "bg-success";
        return (
          <span
            key={`${i}-${bg}`}
            className={`absolute top-1/2 w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 ${color}`}
            style={{ left: `${left}%` }}
          />
        );
      })}
    </div>
  );
}

function Tile({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="bg-surface-alt rounded-lg p-2">
      <div className="text-[10px] text-muted">{label}</div>
      <div className={`text-sm font-bold ${danger ? "text-error" : ""}`}>{value}</div>
    </div>
  );
}
