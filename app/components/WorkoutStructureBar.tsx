import { getZoneColor } from "@/lib/constants";
import { parseWorkoutSegments } from "@/lib/descriptionParser";

interface WorkoutStructureBarProps {
  description: string;
  maxHeight?: number;
}

export function WorkoutStructureBar({
  description,
  maxHeight = 40,
}: WorkoutStructureBarProps) {
  const segments = parseWorkoutSegments(description);

  if (segments.length === 0) return null;

  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);

  return (
    <div className="w-full flex items-end gap-0.5" style={{ height: `${maxHeight}px` }}>
      {segments.map((segment, idx) => {
        const widthPercent = (segment.duration / totalDuration) * 100;
        // Map intensity 70-100% to 30-100% height
        const heightPercent = ((segment.intensity - 70) / 30) * 70 + 30;

        return (
          <div
            key={idx}
            className="transition-all"
            style={{
              width: `${widthPercent}%`,
              height: `${Math.max(heightPercent, 20)}%`,
              backgroundColor: getZoneColor(segment.intensity),
            }}
          />
        );
      })}
    </div>
  );
}
