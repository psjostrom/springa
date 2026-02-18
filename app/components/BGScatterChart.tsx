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
import { ZONE_COLORS, CRASH_DROP_RATE } from "@/lib/constants";
import { getZoneLabel } from "@/lib/utils";
import type { HRZoneName } from "@/lib/types";

interface BGScatterChartProps {
  model: BGResponseModel;
}

const ZONE_ORDER: HRZoneName[] = ["easy", "steady", "tempo", "hard"];

const ZONE_SCATTER_COLORS: Record<HRZoneName, string> = {
  easy: ZONE_COLORS.z2,
  steady: ZONE_COLORS.z3,
  tempo: ZONE_COLORS.z4,
  hard: ZONE_COLORS.z5,
};

const ZONE_X: Record<HRZoneName, number> = {
  easy: 1,
  steady: 2,
  tempo: 3,
  hard: 4,
};

function xTickFormatter(value: number): string {
  const map: Record<number, string> = {
    1: "Easy",
    2: "Race",
    3: "Interval",
    4: "Hard",
  };
  return map[value] ?? "";
}

export function BGScatterChart({ model }: BGScatterChartProps) {
  // Build scatter data with zone-based X position + jitter
  const scatterData: Array<{ x: number; y: number; zone: HRZoneName }> = [];
  const avgMarkers: Array<{ x: number; y: number; zone: HRZoneName }> = [];

  for (const zone of ZONE_ORDER) {
    const zoneObs = model.observations.filter((o) => o.zone === zone);
    const baseX = ZONE_X[zone];

    for (let i = 0; i < zoneObs.length; i++) {
      const obs = zoneObs[i];
      // Deterministic jitter based on index for readability
      const jitter = ((i % 7) - 3) * 0.04;
      scatterData.push({
        x: baseX + jitter,
        y: Number(obs.bgRate.toFixed(2)),
        zone,
      });
    }

    const response = model.zones[zone];
    if (response) {
      avgMarkers.push({
        x: baseX,
        y: Number(response.avgRate.toFixed(2)),
        zone,
      });
    }
  }

  if (scatterData.length === 0) return null;

  return (
    <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4">
      <div className="text-sm font-semibold text-[#c4b5fd] mb-3">
        BG Rate by Zone
      </div>
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
                content={({ payload }) => {
                  if (!payload?.[0]) return null;
                  const d = payload[0].payload as {
                    zone: HRZoneName;
                    y: number;
                  };
                  return (
                    <div className="bg-[#0d0a1a] border border-[#3d2b5a] rounded px-2 py-1 text-xs text-[#e0d0f0]">
                      {getZoneLabel(d.zone)}: {d.y > 0 ? "+" : ""}{d.y} mmol/L/10m
                    </div>
                  );
                }}
              />
              {/* Individual observations */}
              {ZONE_ORDER.map((zone) => {
                const data = scatterData.filter((d) => d.zone === zone);
                if (data.length === 0) return null;
                return (
                  <Scatter
                    key={zone}
                    data={data}
                    fill={ZONE_SCATTER_COLORS[zone]}
                    fillOpacity={0.4}
                    r={3}
                  />
                );
              })}
              {/* Zone averages as larger markers */}
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
