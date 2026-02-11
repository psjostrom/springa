import { Route } from "lucide-react";

interface PhaseTrackerProps {
	phaseName: string;
	currentWeek: number;
	totalWeeks: number;
	progress: number;
}

export function PhaseTracker({
	phaseName,
	currentWeek,
	totalWeeks,
	progress,
}: PhaseTrackerProps) {
	return (
		<div className="bg-slate-800 text-white p-4 rounded-lg shadow-sm">
			<div className="flex items-center gap-2 mb-2">
				<Route className="text-blue-400" size={18} />
				<h3 className="font-bold text-sm">{phaseName}</h3>
			</div>
			<div className="flex justify-between text-xs text-slate-400 mb-1">
				<span>Progress</span>
				<span>
					Week {currentWeek} of {totalWeeks}
				</span>
			</div>
			<div className="w-full bg-slate-700 rounded-full h-2">
				<div
					className="bg-blue-500 h-2 rounded-full transition-all duration-500"
					style={{ width: `${progress}%` }}
				></div>
			</div>
		</div>
	);
}
