import type { DataPoint } from "@/lib/types";
import { ZONE_COLORS, getZoneColor } from "@/lib/constants";

interface HRMiniChartProps {
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
  maxHeight?: number;
  hrData?: DataPoint[];
  lthr?: number;
}

const getHRColor = (hr: number, lthr: number = 169): string => {
  return getZoneColor((hr / lthr) * 100);
};

// Create a mini time-series graph from HR stream data
export function HRMiniChart({
  z1,
  z2,
  z3,
  z4,
  z5,
  maxHeight = 40,
  hrData,
  lthr = 169,
}: HRMiniChartProps) {
  // If we have HR stream data, render a time-series mini graph
  if (hrData && hrData.length > 0) {
    const hrValues = hrData.map((d) => d.value);
    const minHR = Math.min(...hrValues);
    const maxHR = Math.max(...hrValues);
    const hrRange = maxHR - minHR;

    // Sample the data to max 50 points for performance
    const sampleRate = Math.max(1, Math.floor(hrData.length / 50));
    const sampledData = hrData.filter((_, idx) => idx % sampleRate === 0);

    return (
      <div
        className="w-full flex items-end gap-px"
        style={{ height: `${maxHeight}px` }}
      >
        {sampledData.map((point, idx) => {
          const normalizedHeight =
            hrRange > 0 ? ((point.value - minHR) / hrRange) * 100 : 50;
          const color = getHRColor(point.value, lthr);

          return (
            <div
              key={idx}
              style={{
                width: `${100 / sampledData.length}%`,
                height: `${Math.max(normalizedHeight, 10)}%`,
                backgroundColor: color,
              }}
            />
          );
        })}
      </div>
    );
  }

  // Fallback to zone-based visualization if no stream data
  const total = z1 + z2 + z3 + z4 + z5;
  if (total === 0) return null;

  const zones = [
    { time: z1, height: 40, color: ZONE_COLORS.z1 },
    { time: z2, height: 55, color: ZONE_COLORS.z2 },
    { time: z3, height: 70, color: ZONE_COLORS.z3 },
    { time: z4, height: 85, color: ZONE_COLORS.z4 },
    { time: z5, height: 100, color: ZONE_COLORS.z5 },
  ];

  const segments: Array<{ width: number; height: number; color: string }> = [];

  zones.forEach((zone) => {
    if (zone.time > 0) {
      const proportion = zone.time / total;
      const numBars = Math.max(1, Math.round(proportion * 20));

      for (let i = 0; i < numBars; i++) {
        segments.push({
          width: 100 / 20,
          height: zone.height,
          color: zone.color,
        });
      }
    }
  });

  return (
    <div className="w-full flex items-end" style={{ height: `${maxHeight}px` }}>
      {segments.map((segment, idx) => (
        <div
          key={idx}
          style={{
            width: `${segment.width}%`,
            height: `${segment.height}%`,
            backgroundColor: segment.color,
          }}
        />
      ))}
    </div>
  );
}
