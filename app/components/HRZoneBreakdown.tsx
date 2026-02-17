interface HRZoneBreakdownProps {
	z1: number;
	z2: number;
	z3: number;
	z4: number;
	z5: number;
}

function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	const remainingMins = mins % 60;
	return `${hours}h${remainingMins}m`;
}

export function HRZoneBreakdown({ z1, z2, z3, z4, z5 }: HRZoneBreakdownProps) {
	const total = z1 + z2 + z3 + z4 + z5;
	if (total === 0) return null;

	const zones = [
		{ name: "Z1", seconds: z1, color: "bg-[#39ff14]", textColor: "text-[#39ff14]" },
		{ name: "Z2", seconds: z2, color: "bg-[#00ffff]", textColor: "text-[#00ffff]" },
		{ name: "Z3", seconds: z3, color: "bg-[#ffb800]", textColor: "text-[#ffb800]" },
		{ name: "Z4", seconds: z4, color: "bg-[#ff8c00]", textColor: "text-[#ff8c00]" },
		{ name: "Z5", seconds: z5, color: "bg-[#ff3366]", textColor: "text-[#ff3366]" },
	];

	return (
		<div className="space-y-2">
			{zones.map((zone) => {
				if (zone.seconds === 0) return null;
				const percentage = (zone.seconds / total) * 100;

				return (
					<div key={zone.name} className="flex items-center gap-3">
						<div className="flex items-center gap-2 w-20">
							<div className={`w-3 h-3 rounded ${zone.color}`} />
							<span className={`text-sm font-medium ${zone.textColor}`}>{zone.name}</span>
						</div>
						<div className="flex-1 bg-[#2a1f3d] rounded-full h-2 overflow-hidden">
							<div
								className={`h-full ${zone.color}`}
								style={{ width: `${percentage}%` }}
							/>
						</div>
						<div className="flex items-center gap-2 min-w-28">
							<span className="text-sm font-semibold text-white">
								{formatTime(zone.seconds)}
							</span>
							<span className="text-xs text-[#8b7aaa]">
								{percentage.toFixed(1)}%
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
