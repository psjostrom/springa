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
  easy: "#06b6d4",
  long: "#fbbf24",
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
    <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4 no-tap-highlight">
      <div className="text-sm font-semibold text-[#c4b5fd] mb-3">
        BG Rate by Workout Type
      </div>
      <div className="overflow-x-auto -mx-2">
        <div className="min-w-[320px]">
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 10, right: 10, bottom: 5, left: -10 }}>
              <XAxis
                type="number"
                dataKey="x"
                domain={[0.5, 3.5]}
                ticks={[1, 2, 3]}
                tickFormatter={xTickFormatter}
                tick={{ fill: "#b8a5d4", fontSize: 11 }}
                axisLine={{ stroke: "#3d2b5a" }}
                tickLine={false}
              />
              <YAxis
                type="number"
                dataKey="y"
                tick={{ fill: "#b8a5d4", fontSize: 11 }}
                axisLine={{ stroke: "#3d2b5a" }}
                tickLine={false}
                label={{
                  value: "mmol/L /10m",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "#8b7ba8", fontSize: 10 },
                  offset: 20,
                }}
              />
              <ReferenceLine
                y={0}
                stroke="#39ff14"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
              <ReferenceLine
                y={CRASH_DROP_RATE}
                stroke="#ff3366"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{
                  value: "crash",
                  position: "right",
                  fill: "#ff3366",
                  fontSize: 10,
                }}
              />
              <Tooltip
                content={({ payload }: { payload?: readonly { payload: unknown }[] }) => {
                  if (!payload?.[0]) return null;
                  const d = payload[0].payload as {
                    category: WorkoutCategory;
                    y: number;
                  };
                  return (
                    <div className="bg-[#0d0a1a] border border-[#3d2b5a] rounded px-2 py-1 text-xs text-[#e0d0f0]">
                      {CATEGORY_LABELS[d.category]}: {d.y > 0 ? "+" : ""}{d.y} mmol/L/10m
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
                fill="#ffffff"
                stroke="#ffffff"
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
