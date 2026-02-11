import { useMemo } from "react";
import {
	parseISO,
	startOfWeek,
	addWeeks,
	differenceInCalendarWeeks,
	isBefore,
} from "date-fns";

interface PhaseInfo {
	name: string;
	week: number;
	progress: number;
}

export function usePhaseInfo(
	raceDate: string,
	totalWeeks: number,
): PhaseInfo {
	return useMemo(() => {
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
		let name = "Build Phase";
		if (currentWeek === totalWeeks) name = "🏁 Race Week";
		else if (currentWeek === totalWeeks - 1) name = "📉 Taper Phase";
		else if (currentWeek >= totalWeeks - 3) name = "🏔️ Race Test Phase";

		const progress = Math.min(
			100,
			Math.max(0, (currentWeek / totalWeeks) * 100),
		);
		return { name, week: currentWeek, progress };
	}, [raceDate, totalWeeks]);
}
