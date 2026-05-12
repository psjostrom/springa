"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { WorkoutCategory } from "@/lib/types";
import { WORKOUT_CATEGORY_LABEL } from "@/lib/workoutLabels";

export interface CategoryStats {
  runCount: number;
  medianEndBG: number;
  endBGs: { bg: number; date: string }[];
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

function parseLocalDate(dateIso: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatTooltipDate(dateIso: string): string {
  if (!dateIso) return "";
  return format(parseLocalDate(dateIso), "MMM d");
}

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
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
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
      <DotStrip endBGs={stats.endBGs} hoveredIdx={hoveredIdx} onHover={setHoveredIdx} />
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

function DotStrip({
  endBGs,
  hoveredIdx,
  onHover,
}: {
  endBGs: { bg: number; date: string }[];
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
}) {
  const hypoEnd = ((HYPO - MIN) / SPAN) * 100;
  const highStart = ((HIGH - MIN) / SPAN) * 100;

  const hovered = hoveredIdx != null ? endBGs[hoveredIdx] : null;
  const hoveredLeftPct =
    hovered != null
      ? Math.max(0, Math.min(100, ((hovered.bg - MIN) / SPAN) * 100))
      : 0;

  return (
    <div className="relative my-2">
      {hovered && (
        <DotTooltip bg={hovered.bg} date={hovered.date} leftPct={hoveredLeftPct} />
      )}
      <div className="relative h-7 mt-5">
        <div className="absolute top-1 bottom-0 left-0 bg-error opacity-20" style={{ width: `${hypoEnd}%` }} />
        <div
          className="absolute top-1 bottom-0 right-0 bg-warning opacity-20"
          style={{ width: `${100 - highStart}%` }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-border-subtle" />
        {endBGs.map(({ bg, date }, i) => {
          const left = Math.max(0, Math.min(100, ((bg - MIN) / SPAN) * 100));
          const color = bg < HYPO ? "bg-error" : bg > HIGH ? "bg-warning" : "bg-success";
          const dateLabel = date ? `${formatTooltipDate(date)} · ` : "";
          return (
            <button
              key={`${i}-${bg}`}
              type="button"
              aria-label={`${dateLabel}${bg.toFixed(1)} mmol/L`}
              onMouseEnter={() => {
                onHover(i);
              }}
              onMouseLeave={() => {
                onHover(null);
              }}
              onFocus={() => {
                onHover(i);
              }}
              onBlur={() => {
                onHover(null);
              }}
              className={`absolute top-1/2 w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 ${color} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40`}
              style={{ left: `${left}%` }}
            />
          );
        })}
      </div>
      <div className="relative h-3 mt-1 text-[10px] tabular-nums">
        <span className="absolute left-0 text-error">hypo &lt;4.0</span>
        <span className="absolute right-0 text-warning">high &gt;10.0</span>
      </div>
    </div>
  );
}

function DotTooltip({
  bg,
  date,
  leftPct,
}: {
  bg: number;
  date: string;
  leftPct: number;
}) {
  const style: React.CSSProperties =
    leftPct < 8
      ? { left: 0 }
      : leftPct > 92
      ? { right: 0 }
      : { left: `${leftPct}%`, transform: "translateX(-50%)" };
  const dateLabel = date ? formatTooltipDate(date) : "";
  return (
    <div
      role="tooltip"
      className="absolute top-0 z-10 px-2 py-0.5 bg-surface-alt border border-border-subtle rounded text-[10px] tabular-nums whitespace-nowrap pointer-events-none"
      style={style}
    >
      {dateLabel && <span className="text-muted">{dateLabel} · </span>}
      <strong>{bg.toFixed(1)} mmol/L</strong>
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
