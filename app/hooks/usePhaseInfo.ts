import { parseISO, isBefore } from "date-fns";
import { getPhaseDefinitions } from "@/lib/periodization";
import { getPlanWeekContext } from "@/lib/workoutMath";

export interface PhaseInfo {
	name: string;
	week: number;
	progress: number;
}

/** Pure computation — safe to call outside React components. */
export function computePhaseInfo(
	raceDate: string,
	totalWeeks: number,
	includeBasePhase = false,
): PhaseInfo {
	const today = new Date();
	const rDate = parseISO(raceDate);
	const { planStartMonday, currentWeekIdx } = getPlanWeekContext(raceDate, totalWeeks);

	if (isBefore(today, planStartMonday)) {
		return { name: "Pre-Plan", week: 0, progress: 0 };
	}
	if (isBefore(rDate, today)) {
		return { name: "Post-Race", week: totalWeeks, progress: 100 };
	}

	const currentWeek = currentWeekIdx + 1;
	const phases = getPhaseDefinitions(totalWeeks, includeBasePhase);
	const phase = phases.find((p) => currentWeek >= p.startWeek && currentWeek <= p.endWeek);
	const name = phase?.displayName ?? "Build Phase";

	const progress = Math.min(
		100,
		Math.max(0, (currentWeek / totalWeeks) * 100),
	);
	return { name, week: currentWeek, progress };
}
