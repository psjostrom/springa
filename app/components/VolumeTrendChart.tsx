"use client";

import { useMemo } from "react";
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
import type { CalendarEvent } from "@/lib/types";
import { estimateWorkoutDistance } from "@/lib/utils";

interface VolumeTrendChartProps {
  events: CalendarEvent[];
  raceDate: string;
  totalWeeks: number;
}

interface WeekData {
  week: string;
  completed: number;
  planned: number;
  plannedOptional: number;
  isCurrent: boolean;
}

export function VolumeTrendChart({
  events,
  raceDate,
  totalWeeks,
}: VolumeTrendChartProps) {

  const data = useMemo(() => {
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
      isCurrent: i === currentWeekIdx,
    }));

    for (const event of events) {
      const weekIdx = differenceInCalendarWeeks(event.date, planStartMonday, {
        weekStartsOn: 1,
      });
      if (weekIdx < 0 || weekIdx >= totalWeeks) continue;

      const km = estimateWorkoutDistance(event);
      if (event.type === "completed") {
        weeks[weekIdx].completed += km;
      } else if (event.type === "planned") {
        const isOptional = /optional/i.test(event.name);
        if (isOptional) {
          weeks[weekIdx].plannedOptional += km;
        } else {
          weeks[weekIdx].planned += km;
        }
      }
    }

    // Round values
    for (const w of weeks) {
      w.completed = Math.round(w.completed * 10) / 10;
      w.planned = Math.round(w.planned * 10) / 10;
      w.plannedOptional = Math.round(w.plannedOptional * 10) / 10;
    }

    return { weeks, currentWeekIdx };
  }, [events, raceDate, totalWeeks]);

  if (events.length === 0) return null;

  return (
    <div>
      <label className="block text-sm font-semibold uppercase text-[#b8a5d4] mb-2">
        Weekly Volume (km)
      </label>
      <div className="bg-[#1e1535] py-3 rounded-xl shadow-sm border border-[#3d2b5a]">
        <div className="h-72 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart
              data={data.weeks}
              margin={{ top: 5, right: 5, bottom: 0, left: 0 }}
            >
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
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #3d2b5a",
                  backgroundColor: "#1e1535",
                  color: "#fff",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.3)",
                  fontSize: "12px",
                }}
                labelFormatter={(_label, payload) => {
                  const week = payload?.[0]?.payload?.week;
                  if (!week) return "";
                  return `Week ${parseInt(week.replace("W", ""), 10)}`;
                }}
                formatter={(value?: number, name?: string) => {
                  const label =
                    name === "planned"
                      ? "Planned"
                      : name === "plannedOptional"
                        ? "Optional"
                        : "Actual";
                  return [`${value ?? 0} km`, label];
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
              {/* Planned mandatory + optional stacked, behind actual */}
              <Bar
                xAxisId="planned"
                dataKey="planned"
                stackId="plan"
                fill="#00ffff"
                fillOpacity={0.3}
                radius={[0, 0, 0, 0]}
                maxBarSize={14}
              />
              <Bar
                xAxisId="planned"
                dataKey="plannedOptional"
                stackId="plan"
                fill="#c4b5fd"
                fillOpacity={0.25}
                radius={[2, 2, 0, 0]}
                maxBarSize={14}
              />
              {/* Actual on top */}
              <Bar
                xAxisId="actual"
                dataKey="completed"
                fill="#39ff14"
                radius={[2, 2, 0, 0]}
                maxBarSize={10}
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
    </div>
  );
}
