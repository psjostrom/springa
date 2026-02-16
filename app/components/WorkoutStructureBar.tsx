import { HR_ZONE_COLORS, PACE_ESTIMATES } from "@/lib/constants";

interface WorkoutStructureBarProps {
  description: string;
  maxHeight?: number;
}

interface WorkoutSegment {
  duration: number; // in minutes
  intensity: number; // percentage of LTHR (0-100)
}

// Parse workout description to extract structure
function parseWorkoutStructure(description: string): WorkoutSegment[] {
  const segments: WorkoutSegment[] = [];

  // Extract warmup
  const warmupMatch = description.match(/Warmup[\s\S]*?-\s*(?:PUMP.*?\s+)?(\d+)(m|km)\s+(\d+)-(\d+)%/);
  if (warmupMatch) {
    const value = parseInt(warmupMatch[1]);
    const unit = warmupMatch[2];
    const avgPercent = (parseInt(warmupMatch[3]) + parseInt(warmupMatch[4])) / 2;

    let duration: number;
    if (unit === "km") {
      duration = value * PACE_ESTIMATES.easy;
    } else {
      duration = value;
    }

    segments.push({
      duration,
      intensity: avgPercent,
    });
  }

  // Extract main set
  const mainSetMatch = description.match(/Main set\s+(\d+)x/);
  const reps = mainSetMatch ? parseInt(mainSetMatch[1]) : 1;

  // Find all steps in main set
  const mainSetSection = description.match(/Main set[\s\S]*?(?=Cooldown|$)/);
  if (mainSetSection) {
    const stepMatches = Array.from(
      mainSetSection[0].matchAll(/-\s*(?:Uphill\s+|Downhill\s+)?(\d+)(m|km)\s+(\d+)-(\d+)%/g)
    );

    for (let rep = 0; rep < reps; rep++) {
      for (const stepMatch of stepMatches) {
        const value = parseInt(stepMatch[1]);
        const unit = stepMatch[2];
        const minPercent = parseInt(stepMatch[3]);
        const maxPercent = parseInt(stepMatch[4]);
        const avgPercent = (minPercent + maxPercent) / 2;

        let duration: number;
        if (unit === "km") {
          // Convert km to minutes based on zone
          let paceMinPerKm: number;
          if (avgPercent >= 95) paceMinPerKm = PACE_ESTIMATES.hard;
          else if (avgPercent >= 88) paceMinPerKm = PACE_ESTIMATES.tempo;
          else if (avgPercent >= 80) paceMinPerKm = PACE_ESTIMATES.steady;
          else paceMinPerKm = PACE_ESTIMATES.easy;

          duration = value * paceMinPerKm;
        } else {
          duration = value; // Already in minutes
        }

        segments.push({ duration, intensity: avgPercent });
      }
    }
  }

  // Extract cooldown
  const cooldownMatch = description.match(/Cooldown[\s\S]*?-\s*(\d+)(m|km)\s+(\d+)-(\d+)%/);
  if (cooldownMatch) {
    const value = parseInt(cooldownMatch[1]);
    const unit = cooldownMatch[2];
    const avgPercent = (parseInt(cooldownMatch[3]) + parseInt(cooldownMatch[4])) / 2;

    let duration: number;
    if (unit === "km") {
      duration = value * PACE_ESTIMATES.easy;
    } else {
      duration = value;
    }

    segments.push({
      duration,
      intensity: avgPercent,
    });
  }

  return segments;
}

export function WorkoutStructureBar({
  description,
  maxHeight = 40,
}: WorkoutStructureBarProps) {
  const segments = parseWorkoutStructure(description);

  if (segments.length === 0) return null;

  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);

  const getColor = (intensity: number) => {
    if (intensity >= 99) return HR_ZONE_COLORS.z5;
    if (intensity >= 89) return HR_ZONE_COLORS.z4;
    if (intensity >= 78) return HR_ZONE_COLORS.z3;
    if (intensity >= 66) return HR_ZONE_COLORS.z2;
    return HR_ZONE_COLORS.z1;
  };

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
              backgroundColor: getColor(segment.intensity),
            }}
          />
        );
      })}
    </div>
  );
}
