"use client";

import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { SimPoint } from "@/lib/bgSimulation";

interface BGSimChartProps {
  curve: SimPoint[];
  reliable: boolean;
}

export function BGSimChart({ curve, reliable }: BGSimChartProps) {
  const data = curve.map((p) => ({
    minute: p.minute,
    bg: p.bg,
    bgLow: p.bgLow,
    bgHigh: p.bgHigh,
    // Area needs a range: [low, high]
    band: [p.bgLow, p.bgHigh] as [number, number],
  }));

  const allValues = curve.flatMap((p) => [p.bgLow, p.bgHigh, p.bg]);
  const minY = Math.floor(Math.min(...allValues) - 0.5);
  const maxY = Math.ceil(Math.max(...allValues) + 0.5);

  const opacity = reliable ? 1 : 0.4;

  return (
    <div className="w-full h-56 md:h-72" style={{ opacity }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="simBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00ffff" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#00ffff" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="minute"
            tick={{ fill: "#b8a5d4", fontSize: 12 }}
            axisLine={{ stroke: "#3d2b5a" }}
            tickLine={false}
            tickFormatter={(v: number) => `${v}m`}
          />
          <YAxis
            domain={[minY, maxY]}
            tick={{ fill: "#b8a5d4", fontSize: 12 }}
            axisLine={{ stroke: "#3d2b5a" }}
            tickLine={false}
            tickFormatter={(v: number) => v.toFixed(1)}
          />

          {/* Hypo threshold */}
          <ReferenceLine
            y={3.9}
            stroke="#ff3366"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
          />

          {/* Confidence band */}
          <Area
            dataKey="bgHigh"
            stroke="none"
            fill="url(#simBand)"
            isAnimationActive={false}
          />
          <Area
            dataKey="bgLow"
            stroke="none"
            fill="#0d0a1a"
            isAnimationActive={false}
          />

          {/* Main prediction line */}
          <Line
            type="monotone"
            dataKey="bg"
            stroke="#00ffff"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />

          <Tooltip
            contentStyle={{
              background: "#1e1535",
              border: "1px solid #3d2b5a",
              borderRadius: 8,
              fontSize: 13,
            }}
            labelFormatter={(label) => `${label} min`}
            formatter={(value?: number, name?: string) => {
              const n = name ?? "";
              if (value == null) return ["-", n];
              const labels: Record<string, string> = {
                bg: "Predicted BG",
                bgHigh: "Upper band",
                bgLow: "Lower band",
              };
              return [`${value.toFixed(1)} mmol/L`, labels[n] ?? n];
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
