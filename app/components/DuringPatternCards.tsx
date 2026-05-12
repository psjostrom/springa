"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import type { WorkoutCategory } from "@/lib/types";
import { WORKOUT_CATEGORY_LABEL } from "@/lib/workoutLabels";
import { BG_HYPO } from "@/lib/constants";

export interface CategoryStats {
  runCount: number;
  medianEndBG: number;
  endBGs: { bg: number; date: string; activityId: string }[];
  hypoCount: number;
  avgDropPerHr: number;
}

interface Props {
  stats: Record<WorkoutCategory, CategoryStats | null>;
  onActivitySelect?: (activityId: string) => void;
}

const NAME_COLOR: Record<WorkoutCategory, string> = {
  easy: "text-[var(--theme-chart-secondary)]",
  long: "text-warning",
  interval: "text-warning",
};

const HIGH = 10.0;
const MIN = 3.5;
const MAX = 14.0;
const SPAN = MAX - MIN;
// Half-dot inset (percent) so 8px dots stay fully inside the strip on typical
// widths (≥260px). Without this, dots at MIN/MAX render half outside the strip.
const DOT_HALF_PCT = 1.5;
// Grace period (ms) after the cursor leaves a dot before the tooltip closes.
// Lets the cursor transit from dot to tooltip without losing the tooltip.
const TOOLTIP_CLOSE_DELAY_MS = 100;

function parseLocalDate(dateIso: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatTooltipDate(dateIso: string): string {
  if (!dateIso) return "";
  return format(parseLocalDate(dateIso), "MMM d");
}

function dotPosition(bg: number): number {
  const raw = ((bg - MIN) / SPAN) * 100;
  return Math.max(DOT_HALF_PCT, Math.min(100 - DOT_HALF_PCT, raw));
}

export function DuringPatternCards({ stats, onActivitySelect }: Props) {
  const ordered = (Object.entries(stats) as [WorkoutCategory, CategoryStats | null][])
    .filter((entry): entry is [WorkoutCategory, CategoryStats] => entry[1] != null)
    .sort(
      ([, a], [, b]) =>
        b.hypoCount / Math.max(b.runCount, 1) - a.hypoCount / Math.max(a.runCount, 1),
    );

  return (
    <div className="space-y-2">
      {ordered.map(([cat, s], i) => (
        <Card
          key={cat}
          cat={cat}
          stats={s}
          isWorst={i === 0}
          onActivitySelect={onActivitySelect}
        />
      ))}
    </div>
  );
}

function Card({
  cat,
  stats,
  isWorst,
  onActivitySelect,
}: {
  cat: WorkoutCategory;
  stats: CategoryStats;
  isWorst: boolean;
  onActivitySelect?: (activityId: string) => void;
}) {
  const hypoPct = Math.round((stats.hypoCount / stats.runCount) * 100);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending close timer if the card unmounts before the grace
  // period elapses (e.g., parent re-renders mid-hover).
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const openTooltip = (idx: number) => {
    cancelClose();
    setHoveredIdx(idx);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setHoveredIdx(null);
      closeTimerRef.current = null;
    }, TOOLTIP_CLOSE_DELAY_MS);
  };

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
      <DotStrip
        endBGs={stats.endBGs}
        hoveredIdx={hoveredIdx}
        openTooltip={openTooltip}
        scheduleClose={scheduleClose}
        cancelClose={cancelClose}
        onActivitySelect={onActivitySelect}
      />
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Tile
          label={`Hypo runs (min < ${BG_HYPO.toFixed(1)})`}
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
  openTooltip,
  scheduleClose,
  cancelClose,
  onActivitySelect,
}: {
  endBGs: { bg: number; date: string; activityId: string }[];
  hoveredIdx: number | null;
  openTooltip: (idx: number) => void;
  scheduleClose: () => void;
  cancelClose: () => void;
  onActivitySelect?: (activityId: string) => void;
}) {
  const hypoEnd = ((BG_HYPO - MIN) / SPAN) * 100;
  const highStart = ((HIGH - MIN) / SPAN) * 100;

  const hovered = hoveredIdx != null ? endBGs[hoveredIdx] : null;
  const hoveredLeftPct = hovered != null ? dotPosition(hovered.bg) : 0;

  return (
    <div className="relative my-2">
      {hovered && (
        <DotTooltip
          bg={hovered.bg}
          date={hovered.date}
          activityId={hovered.activityId}
          leftPct={hoveredLeftPct}
          onActivitySelect={onActivitySelect}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        />
      )}
      <div className="relative h-7 mt-5">
        <div className="absolute top-1 bottom-0 left-0 bg-error opacity-20" style={{ width: `${hypoEnd}%` }} />
        <div
          className="absolute top-1 bottom-0 right-0 bg-warning opacity-20"
          style={{ width: `${100 - highStart}%` }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-border-subtle" />
        {endBGs.map(({ bg, date, activityId }, i) => {
          const left = dotPosition(bg);
          const color = bg < BG_HYPO ? "bg-error" : bg > HIGH ? "bg-warning" : "bg-success";
          const dateLabel = date ? `${formatTooltipDate(date)} · ` : "";
          return (
            <button
              // Stable per-run key so focus/tooltip state doesn't bind to the
              // wrong run when endBGs reorders.
              key={activityId}
              type="button"
              // Visible 8px dot, but the tap target is a 32×32 wrapper button
              // so mobile users can hit it without precision aiming. The dot
              // is centered inside via grid.
              aria-label={`${dateLabel}${bg.toFixed(1)} mmol/L`}
              onClick={() => {
                if (onActivitySelect) onActivitySelect(activityId);
              }}
              onMouseEnter={() => {
                openTooltip(i);
              }}
              onMouseLeave={() => {
                scheduleClose();
              }}
              onFocus={() => {
                openTooltip(i);
              }}
              onBlur={() => {
                scheduleClose();
              }}
              className="absolute top-1/2 grid place-items-center w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              style={{ left: `${left}%` }}
            >
              <span className={`block w-2 h-2 rounded-full ${color}`} aria-hidden />
            </button>
          );
        })}
      </div>
      <div className="relative h-3 mt-1 text-[10px] tabular-nums">
        <span className="absolute left-0 text-error">hypo &lt;{BG_HYPO.toFixed(1)}</span>
        <span className="absolute right-0 text-warning">high &gt;{HIGH.toFixed(1)}</span>
      </div>
    </div>
  );
}

function DotTooltip({
  bg,
  date,
  activityId,
  leftPct,
  onActivitySelect,
  onMouseEnter,
  onMouseLeave,
}: {
  bg: number;
  date: string;
  activityId: string;
  leftPct: number;
  onActivitySelect?: (activityId: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const style: React.CSSProperties =
    leftPct < 8
      ? { left: 0 }
      : leftPct > 92
      ? { right: 0 }
      : { left: `${leftPct}%`, transform: "translateX(-50%)" };
  const dateLabel = date ? formatTooltipDate(date) : "";
  const clickable = Boolean(onActivitySelect);
  const text = `${dateLabel}${bg.toFixed(1)} mmol/L`;
  return (
    <button
      type="button"
      data-testid="dot-tooltip"
      disabled={!clickable}
      aria-label={clickable ? `Open ${text} run` : text}
      onClick={() => {
        if (onActivitySelect) onActivitySelect(activityId);
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`absolute top-0 z-10 px-2 py-0.5 bg-surface-alt border border-border-subtle rounded text-[10px] tabular-nums whitespace-nowrap ${clickable ? "cursor-pointer hover:bg-border" : ""} disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40`}
      style={style}
    >
      {dateLabel && <span className="text-muted">{dateLabel} · </span>}
      <strong>{bg.toFixed(1)} mmol/L</strong>
    </button>
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
