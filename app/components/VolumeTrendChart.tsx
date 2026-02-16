"use client";

import { useMemo, useState, useEffect, useRef } from "react";
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
  startOfMonth,
  subMonths,
  endOfMonth,
  addMonths,
} from "date-fns";
import type { CalendarEvent } from "@/lib/types";
import { estimateWorkoutDistance } from "@/lib/utils";
import { fetchCalendarData } from "@/lib/intervalsApi";

interface VolumeTrendChartProps {
  apiKey: string;
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
  apiKey,
  raceDate,
  totalWeeks,
}: VolumeTrendChartProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!apiKey || loadedRef.current) return;
    loadedRef.current = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const start = startOfMonth(subMonths(new Date(), 24));
        const end = endOfMonth(addMonths(new Date(), 6));
        const data = await fetchCalendarData(apiKey, start, end, {
          includePairedEvents: true,
        });
        setEvents(data);
      } catch (err) {
        console.error("VolumeTrendChart: failed to load events", err);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [apiKey]);

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

  if (isLoading || events.length === 0) return null;

  return (
    <div>
      <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
        Weekly Volume (km)
      </label>
      <div className="bg-white py-3 rounded-xl shadow-sm border border-slate-100">
        <div className="h-72 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
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
              />
              <YAxis
                width={30}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
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
                    stroke="#6366f1"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                  />
                )}
              {/* Planned mandatory + optional stacked, behind actual */}
              <Bar
                xAxisId="planned"
                dataKey="planned"
                stackId="plan"
                fill="#93c5fd"
                fillOpacity={0.4}
                radius={[0, 0, 0, 0]}
                maxBarSize={14}
              />
              <Bar
                xAxisId="planned"
                dataKey="plannedOptional"
                stackId="plan"
                fill="#c4b5fd"
                fillOpacity={0.35}
                radius={[2, 2, 0, 0]}
                maxBarSize={14}
              />
              {/* Actual on top */}
              <Bar
                xAxisId="actual"
                dataKey="completed"
                fill="#10b981"
                radius={[2, 2, 0, 0]}
                maxBarSize={10}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            Actual
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-300/60" />
            Planned
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-300/50" />
            Optional
          </span>
        </div>
      </div>
    </div>
  );
}
