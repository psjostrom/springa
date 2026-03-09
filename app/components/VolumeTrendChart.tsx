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
import {
  startOfWeek,
  addWeeks,
  differenceInCalendarWeeks,
  parseISO,
} from "date-fns";
import type { CalendarEvent, PaceTable } from "@/lib/types";
import { estimateWorkoutDistance, estimatePlanEventDistance } from "@/lib/workoutMath";
import { generateFullPlan } from "@/lib/workoutGenerators";
import { DEFAULT_LTHR } from "@/lib/constants";

interface VolumeTrendChartProps {
  events: CalendarEvent[];
  raceDate: string;
  totalWeeks: number;
  raceDist?: number;
  prefix?: string;
  startKm?: number;
  lthr?: number;
  hrZones?: number[];
  paceTable?: PaceTable;
  includeBasePhase?: boolean;
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
  prefix,
  startKm,
  lthr,
  hrZones,
  paceTable,
  includeBasePhase,
}: VolumeTrendChartProps) {

  const data = (() => {
    const rDate = parseISO(raceDate);
    const raceWeekMonday = startOfWeek(rDate, { weekStartsOn: 1 });
    const planStartMonday = addWeeks(raceWeekMonday, -(totalWeeks - 1));
    const today = new Date();

    const currentWeekIdx = differenceInCalendarWeeks(today, planStartMonday, {
      weekStartsOn: 1,
    });

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
    const planEvents = generateFullPlan(null, raceDate, raceDist ?? 16, prefix ?? "eco16", totalWeeks, startKm ?? 8, lthr ?? DEFAULT_LTHR, hrZones, includeBasePhase ?? false);
    for (const pe of planEvents) {
      // Skip events excluded from plan (e.g., club run as alternative to speed session)
      if (pe.excludeFromPlan) continue;
      const weekIdx = differenceInCalendarWeeks(pe.start_date_local, planStartMonday, {
        weekStartsOn: 1,
      });
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
      const weekIdx = differenceInCalendarWeeks(event.date, planStartMonday, {
        weekStartsOn: 1,
      });
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
    <div className="bg-[#1e1535] py-3 rounded-xl shadow-sm border border-[#3d2b5a] no-tap-highlight">
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
                tick={{ fill: "#b8a5d4" }}
              />
              <YAxis
                width={30}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}`}
                tick={{ fill: "#b8a5d4" }}
              />
              <Tooltip
                cursor={{ fill: "#2a1f3d" }}
                content={({ active, payload }) => {
                  if (!active || payload.length === 0) return null;
                  const d = (payload[0] as { payload: WeekData }).payload;
                  const weekNum = parseInt(d.week.replace("W", ""), 10);
                  return (
                    <div className="rounded-lg border border-[#3d2b5a] bg-[#1e1535] text-white shadow-lg text-xs px-3 py-2">
                      <div className="font-medium mb-1">Week {weekNum}</div>
                      <div className="text-[#00ffff]">Planned : {d.planned} km</div>
                      {d.plannedOptional > 0 && (
                        <div className="text-[#c4b5fd]">Optional : {d.plannedOptional} km</div>
                      )}
                      <div className="text-white">Total : {d.plannedTotal} km</div>
                      {d.completed > 0 && (
                        <>
                          <div className="border-t border-[#3d2b5a] my-1.5" />
                          <div className="text-[#39ff14]">Actual : {d.completed} km</div>
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
                    stroke="#ff2d95"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                  />
                )}
              {/* Optional: full height (planned + optional), rendered behind */}
              <Bar
                xAxisId="plannedTotal"
                dataKey="plannedTotal"
                fill="#c4b5fd"
                fillOpacity={0.25}
                radius={2}
                maxBarSize={14}
              />
              {/* Planned: mandatory only, rendered on top */}
              <Bar
                xAxisId="planned"
                dataKey="planned"
                fill="#00ffff"
                fillOpacity={0.3}
                radius={2}
                maxBarSize={14}
              />
              {/* Actual on top */}
              <Bar
                xAxisId="actual"
                dataKey="completed"
                fill="#39ff14"
                radius={2}
                maxBarSize={14}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-sm text-[#b8a5d4]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#39ff14]" />
            Actual
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#00ffff]/40" />
            Planned
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#c4b5fd]/40" />
            Optional
          </span>
        </div>
    </div>
  );
}