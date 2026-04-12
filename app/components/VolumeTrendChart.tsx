"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { CalendarEvent, PaceTable } from "@/lib/types";
import { estimateWorkoutDistance, estimatePlanEventDistance, getPlanWeekContext, getWeekIdx } from "@/lib/workoutMath";
import { generateFullPlan } from "@/lib/workoutGenerators";
import { DEFAULT_LTHR } from "@/lib/constants";

interface VolumeTrendChartProps {
  events: CalendarEvent[];
  raceDate: string;
  totalWeeks: number;
  raceDist?: number;
  startKm?: number;
  lthr?: number;
  hrZones?: number[];
  paceTable?: PaceTable;
  includeBasePhase?: boolean;
  currentAbilitySecs?: number;
  currentAbilityDist?: number;
  goalTime?: number;
}

interface WeekData {
  week: string;
  completed: number;
  planned: number;
  plannedOptional: number;
  plannedTotal: number;
  isCurrent: boolean;
}

export function VolumeTrendChart({
  events,
  raceDate,
  totalWeeks,
  raceDist,
  startKm,
  lthr,
  hrZones,
  paceTable,
  includeBasePhase,
  currentAbilitySecs,
  currentAbilityDist,
  goalTime,
}: VolumeTrendChartProps) {

  const data = (() => {
    const { planStartMonday, currentWeekIdx } = getPlanWeekContext(raceDate, totalWeeks);

    const weeks: WeekData[] = Array.from({ length: totalWeeks }, (_, i) => ({
      week: `W${String(i + 1).padStart(2, "0")}`,
      completed: 0,
      planned: 0,
      plannedOptional: 0,
      plannedTotal: 0,
      isCurrent: i === currentWeekIdx,
    }));

    // Planned distances from the deterministic plan generator (covers all weeks)
    if (hrZones?.length !== 5) return { weeks, currentWeekIdx };
    const planEvents = generateFullPlan({
      bgModel: null,
      raceDateStr: raceDate,
      raceDist: raceDist ?? 16,
      totalWeeks,
      startKm: startKm ?? 8,
      lthr: lthr ?? DEFAULT_LTHR,
      hrZones,
      includeBasePhase: includeBasePhase ?? false,
      currentAbilitySecs,
      currentAbilityDist,
    });
    for (const pe of planEvents) {
      const weekIdx = getWeekIdx(pe.start_date_local, planStartMonday);
      if (weekIdx < 0 || weekIdx >= totalWeeks) continue;
      const km = estimatePlanEventDistance(pe, paceTable);
      const isOptional = /bonus|optional/i.test(pe.name);
      if (isOptional) {
        weeks[weekIdx].plannedOptional += km;
      } else {
        weeks[weekIdx].planned += km;
      }
    }

    // Completed distances from actual API data
    for (const event of events) {
      if (event.type !== "completed") continue;
      const weekIdx = getWeekIdx(event.date, planStartMonday);
      if (weekIdx < 0 || weekIdx >= totalWeeks) continue;
      weeks[weekIdx].completed += estimateWorkoutDistance(event, paceTable);
    }

    // Compute totals and round
    for (const w of weeks) {
      w.completed = Math.round(w.completed * 10) / 10;
      w.planned = Math.round(w.planned * 10) / 10;
      w.plannedOptional = Math.round(w.plannedOptional * 10) / 10;
      w.plannedTotal = Math.round((w.planned + w.plannedOptional) * 10) / 10;
    }

    return { weeks, currentWeekIdx };
  })();

  if (events.length === 0) return null;

  return (
    <div className="bg-surface py-3 rounded-xl shadow-sm border border-border no-tap-highlight">
        <div className="h-72 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart
              data={data.weeks}
              margin={{ top: 5, right: 5, bottom: 0, left: 0 }}
            >
              <XAxis
                xAxisId="plannedTotal"
                dataKey="week"
                hide
                padding={{ left: 2, right: 2 }}
              />
              <XAxis
                xAxisId="planned"
                dataKey="week"
                hide
                padding={{ left: 2, right: 2 }}
              />
              <XAxis
                xAxisId="actual"
                dataKey="week"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval={1}
                padding={{ left: 2, right: 2 }}
                tick={{ fill: "var(--color-muted)" }}
              />
              <YAxis
                width={30}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}`}
                tick={{ fill: "var(--color-muted)" }}
              />
              <Tooltip
                cursor={{ fill: "var(--color-border)" }}
                content={({ active, payload }) => {
                  if (!active || payload.length === 0) return null;
                  const d = (payload[0] as { payload: WeekData }).payload;
                  const weekNum = parseInt(d.week.replace("W", ""), 10);
                  return (
                    <div className="rounded-lg border border-border bg-surface text-text shadow-lg text-xs px-3 py-2">
                      <div className="font-medium mb-1">Week {weekNum}</div>
                      <div className="text-muted">Planned : {d.planned} km</div>
                      {d.plannedOptional > 0 && (
                        <div className="text-muted">Optional : {d.plannedOptional} km</div>
                      )}
                      <div className="text-text">Total : {d.plannedTotal} km</div>
                      {d.completed > 0 && (
                        <>
                          <div className="border-t border-border my-1.5" />
                          <div className="text-success">Actual : {d.completed} km</div>
                        </>
                      )}
                    </div>
                  );
                }}
              />
              {data.currentWeekIdx >= 0 &&
                data.currentWeekIdx < data.weeks.length && (
                  <ReferenceLine
                    x={data.weeks[data.currentWeekIdx].week}
                    xAxisId="actual"
                    stroke="var(--color-brand)"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                  />
                )}
              {/* Optional: full height (planned + optional), rendered behind */}
              <Bar
                xAxisId="plannedTotal"
                dataKey="plannedTotal"
                fill="var(--color-muted)"
                fillOpacity={0.25}
                radius={2}
                maxBarSize={14}
              />
              {/* Planned: mandatory only, rendered on top */}
              <Bar
                xAxisId="planned"
                dataKey="planned"
                fill="var(--color-chart-primary)"
                fillOpacity={0.3}
                radius={2}
                maxBarSize={14}
              />
              {/* Actual on top */}
              <Bar
                xAxisId="actual"
                dataKey="completed"
                fill="var(--color-success)"
                radius={2}
                maxBarSize={14}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-sm text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-success" />
            Actual
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-chart-primary/40" />
            Planned
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-muted/40" />
            Optional
          </span>
        </div>
    </div>
  );
}