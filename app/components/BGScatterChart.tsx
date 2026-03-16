"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { BGResponseModel } from "@/lib/bgModel";
import { CRASH_DROP_RATE } from "@/lib/constants";
import type { WorkoutCategory } from "@/lib/types";

interface BGScatterChartProps {
  model: BGResponseModel;
}

const CATEGORY_ORDER: WorkoutCategory[] = ["easy", "long", "interval"];

const CATEGORY_COLORS: Record<WorkoutCategory, string> = {
  easy: "var(--color-chart-secondary)",
  long: "var(--color-warning)",
  interval: "#fb923c",
};

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  easy: "Easy",
  long: "Long",
  interval: "Interval",
};

const CATEGORY_X: Record<WorkoutCategory, number> = {
  easy: 1,
  long: 2,
  interval: 3,
};

function xTickFormatter(value: number): string {
  const map: Record<number, string> = {
    1: "Easy",
    2: "Long",
    3: "Interval",
  };
  return map[value] ?? "";
}

export function BGScatterChart({ model }: BGScatterChartProps) {
  const scatterData: { x: number; y: number; category: WorkoutCategory }[] = [];
  const avgMarkers: { x: number; y: number; category: WorkoutCategory }[] = [];

  for (const cat of CATEGORY_ORDER) {
    const catObs = model.observations.filter((o) => o.category === cat);
    const baseX = CATEGORY_X[cat];

    for (let i = 0; i < catObs.length; i++) {
      const obs = catObs[i];
      const jitter = ((i % 7) - 3) * 0.04;
      scatterData.push({
        x: baseX + jitter,
        y: Number(obs.bgRate.toFixed(2)),
        category: cat,
      });
    }

    const response = model.categories[cat];
    if (response) {
      avgMarkers.push({
        x: baseX,
        y: Number(response.avgRate.toFixed(2)),
        category: cat,
      });
    }
  }

  if (scatterData.length === 0) return null;

  return (
    <div className="bg-surface rounded-xl border border-border p-4 no-tap-highlight">
      <div className="overflow-x-auto -mx-2">
        <div className="min-w-[320px]">
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 10, right: 10, bottom: 5, left: -10 }}>
              <XAxis
                type="number"
                dataKey="x"
                domain={[0.5, 4.5]}
                ticks={[1, 2, 3, 4]}
                tickFormatter={xTickFormatter}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                axisLine={{ stroke: "var(--color-border)" }}
                tickLine={false}
              />
              <YAxis
                type="number"
                dataKey="y"
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                axisLine={{ stroke: "var(--color-border)" }}
                tickLine={false}
                label={{
                  value: "mmol/L /min",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "var(--color-muted)", fontSize: 10 },
                  offset: 20,
                }}
              />
              <ReferenceLine
                y={0}
                stroke="var(--color-success)"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
              <ReferenceLine
                y={CRASH_DROP_RATE}
                stroke="var(--color-error)"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{
                  value: "crash",
                  position: "right",
                  fill: "var(--color-error)",
                  fontSize: 10,
                }}
              />
              <Tooltip
                content={(props) => {
                  if (props.payload.length === 0) return null;
                  const d = (props.payload[0] as { payload: { category: WorkoutCategory; y: number } }).payload;
                  return (
                    <div className="bg-bg border border-border rounded px-2 py-1 text-xs text-muted">
                      {CATEGORY_LABELS[d.category]}: {d.y > 0 ? "+" : ""}{d.y} mmol/L/5m
                    </div>
                  );
                }}
              />
              {CATEGORY_ORDER.map((cat) => {
                const data = scatterData.filter((d) => d.category === cat);
                if (data.length === 0) return null;
                return (
                  <Scatter
                    key={cat}
                    data={data}
                    fill={CATEGORY_COLORS[cat]}
                    fillOpacity={0.4}
                    r={3}
                  />
                );
              })}
              <Scatter
                data={avgMarkers}
                fill="var(--color-text)"
                stroke="var(--color-text)"
                strokeWidth={2}
                r={6}
                shape="diamond"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
