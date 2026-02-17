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
		<div className="bg-[#1e1535] text-white p-4 rounded-lg border border-[#3d2b5a]">
			<div className="flex items-center gap-2 mb-2">
				<Route className="text-[#00ffff]" size={18} />
				<h3 className="font-bold text-sm">{phaseName}</h3>
			</div>
			<div className="flex justify-between text-xs text-[#8b7aaa] mb-1">
				<span>Progress</span>
				<span>
					Week {currentWeek} of {totalWeeks}
				</span>
			</div>
			<div className="w-full bg-[#2a1f3d] rounded-full h-2">
				<div
					className="bg-[#ff2d95] h-2 rounded-full transition-all duration-500 shadow-[0_0_8px_#ff2d95]"
					style={{ width: `${progress}%` }}
				></div>
			</div>
		</div>
	);
}
