import { useMemo } from "react";
import { getISOWeek } from "date-fns";
import type { WorkoutEvent } from "@/lib/types";
import { getEstimatedDuration } from "@/lib/workoutMath";

export function useWeeklyVolumeData(planEvents: WorkoutEvent[]) {
	return useMemo(() => {
		const weeklyVolume = planEvents.reduce<Record<string, number>>(
			(acc, event) => {
				const weekNum = getISOWeek(event.start_date_local);
				const label = `W${weekNum.toString().padStart(2, "0")}`;
				const duration = getEstimatedDuration(event);
				acc[label] = (acc[label] || 0) + duration;
				return acc;
			},
			{},
		);

		return Object.entries(weeklyVolume)
			.map(([name, mins]) => ({ name, mins }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [planEvents]);
}
