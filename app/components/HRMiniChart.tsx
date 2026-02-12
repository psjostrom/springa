interface HRMiniChartProps {
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
  maxHeight?: number;
}

// Create a simplified vertical bar chart from HR zone data
export function HRMiniChart({ z1, z2, z3, z4, z5, maxHeight = 40 }: HRMiniChartProps) {
  const total = z1 + z2 + z3 + z4 + z5;
  if (total === 0) return null;

  // Create segments representing time spent in each zone
  // We'll create proportional bars where each bar's height represents the zone
  const zones = [
    { time: z1, height: 40, color: "#6ee7b7" }, // Z1 - emerald-300
    { time: z2, height: 55, color: "#06b6d4" }, // Z2 - cyan-500
    { time: z3, height: 70, color: "#fbbf24" }, // Z3 - yellow-400
    { time: z4, height: 85, color: "#fb923c" }, // Z4 - orange-400
    { time: z5, height: 100, color: "#ef4444" }, // Z5 - red-500
  ];

  // Create bar segments proportional to time spent
  const segments: Array<{ width: number; height: number; color: string }> = [];

  zones.forEach((zone) => {
    if (zone.time > 0) {
      const proportion = zone.time / total;
      const numBars = Math.max(1, Math.round(proportion * 20)); // Create up to 20 bars

      for (let i = 0; i < numBars; i++) {
        segments.push({
          width: 100 / 20, // Each bar takes equal width
          height: zone.height,
          color: zone.color,
        });
      }
    }
  });

  return (
    <div className="w-full flex items-end gap-px" style={{ height: `${maxHeight}px` }}>
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
