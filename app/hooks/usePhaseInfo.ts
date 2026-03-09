import {
	parseISO,
	startOfWeek,
	addWeeks,
	differenceInCalendarWeeks,
	isBefore,
} from "date-fns";
import { getPhaseForWeek } from "@/lib/periodization";

export interface PhaseInfo {
	name: string;
	week: number;
	progress: number;
}

const PHASE_DISPLAY: Record<string, string> = {
	"Base": "Base Phase",
	"Build": "Build Phase",
	"Race Test": "Race Test Phase",
	"Taper": "Taper Phase",
	"Race Week": "Race Week",
};

/** Pure computation — safe to call outside React components. */
export function computePhaseInfo(
	raceDate: string,
	totalWeeks: number,
	includeBasePhase = false,
): PhaseInfo {
	const today = new Date();
	const rDate = parseISO(raceDate);
	const raceWeekMonday = startOfWeek(rDate, { weekStartsOn: 1 });
	const planStartMonday = addWeeks(raceWeekMonday, -(totalWeeks - 1));

	if (isBefore(today, planStartMonday)) {
		return { name: "Pre-Plan", week: 0, progress: 0 };
	}
	if (isBefore(rDate, today)) {
		return { name: "Post-Race", week: totalWeeks, progress: 100 };
	}

	const currentWeek =
		differenceInCalendarWeeks(today, planStartMonday, { weekStartsOn: 1 }) +
		1;
	const phase = getPhaseForWeek(currentWeek, totalWeeks, includeBasePhase);
	const name = PHASE_DISPLAY[phase] ?? phase;

	const progress = Math.min(
		100,
		Math.max(0, (currentWeek / totalWeeks) * 100),
	);
	return { name, week: currentWeek, progress };
}
