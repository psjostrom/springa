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
			<div className="flex justify-between text-sm mb-1">
				<span className="font-bold">{phaseName}</span>
				<span className="text-[#b8a5d4]">
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
