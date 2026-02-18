import { ZONE_COLORS } from "@/lib/constants";

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

const ZONES = [
	{ key: "z1" as const, label: "Z1" },
	{ key: "z2" as const, label: "Z2" },
	{ key: "z3" as const, label: "Z3" },
	{ key: "z4" as const, label: "Z4" },
	{ key: "z5" as const, label: "Z5" },
];

export function HRZoneBreakdown({ z1, z2, z3, z4, z5 }: HRZoneBreakdownProps) {
	const total = z1 + z2 + z3 + z4 + z5;
	if (total === 0) return null;

	const values = { z1, z2, z3, z4, z5 };

	return (
		<div className="space-y-2">
			{ZONES.map(({ key, label }) => {
				const seconds = values[key];
				if (seconds === 0) return null;
				const percentage = (seconds / total) * 100;
				const color = ZONE_COLORS[key];

				return (
					<div key={key} className="flex items-center gap-3">
						<div className="flex items-center gap-2 w-20">
							<div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
							<span className="text-sm font-medium" style={{ color }}>{label}</span>
						</div>
						<div className="flex-1 bg-[#2a1f3d] rounded-full h-2 overflow-hidden">
							<div
								className="h-full"
								style={{ backgroundColor: color, width: `${percentage}%` }}
							/>
						</div>
						<div className="flex items-center gap-2 min-w-28">
							<span className="text-sm font-semibold text-white">
								{formatTime(seconds)}
							</span>
							<span className="text-sm text-[#b8a5d4]">
								{percentage.toFixed(1)}%
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
