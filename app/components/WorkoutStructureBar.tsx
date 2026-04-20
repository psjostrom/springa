import { ZONE_COLORS, classifyHR, DEFAULT_LTHR } from "@/lib/constants";
import { parseWorkoutSegments, classifyPacePct } from "@/lib/descriptionParser";

interface WorkoutStructureBarProps {
  description: string;
  maxHeight?: number;
  hrZones?: number[];
  lthr?: number;
  thresholdPace?: number;
}

export function WorkoutStructureBar({
  description,
  maxHeight = 40,
  hrZones,
  lthr = DEFAULT_LTHR,
  thresholdPace,
}: WorkoutStructureBarProps) {
  const segments = parseWorkoutSegments(description, undefined, thresholdPace);
  const isPaceBased = description.includes("/km Pace") || description.includes("% pace");

  if (!segments.length) return null;
  const validHrZones = hrZones?.length === 5 ? hrZones : null;
  if (!isPaceBased && !validHrZones) return null;

  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);

  return (
    <div className="w-full flex items-end gap-0.5" style={{ height: `${maxHeight}px` }}>
      {segments.map((segment, idx) => {
        const widthPercent = (segment.duration / totalDuration) * 100;
        const heightPercent = ((segment.intensity - 70) / 30) * 70 + 30;
        const zoneKey = isPaceBased || !validHrZones
          ? classifyPacePct(segment.intensity)
          : classifyHR((segment.intensity / 100) * lthr, validHrZones);

        return (
          <div
            key={idx}
            className="transition-all"
            style={{
              width: `${widthPercent}%`,
              height: `${Math.max(heightPercent, 20)}%`,
              backgroundColor: ZONE_COLORS[zoneKey],
            }}
          />
        );
      })}
    </div>
  );
}
