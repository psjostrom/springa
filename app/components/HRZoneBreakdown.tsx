import { ZONE_COLORS, ZONE_DISPLAY_NAMES } from "@/lib/constants";
import { formatZoneTime } from "@/lib/format";

interface HRZoneBreakdownProps {
	z1: number;
	z2: number;
	z3: number;
	z4: number;
	z5: number;
}

const ZONES = [
	{ key: "z5" as const, label: `Z5 ${ZONE_DISPLAY_NAMES.z5}` },
	{ key: "z4" as const, label: `Z4 ${ZONE_DISPLAY_NAMES.z4}` },
	{ key: "z3" as const, label: `Z3 ${ZONE_DISPLAY_NAMES.z3}` },
	{ key: "z2" as const, label: `Z2 ${ZONE_DISPLAY_NAMES.z2}` },
	{ key: "z1" as const, label: `Z1 ${ZONE_DISPLAY_NAMES.z1}` },
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
						<div className="flex items-center gap-2 w-28 whitespace-nowrap">
							<div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
							<span className="text-sm font-medium" style={{ color }}>{label}</span>
						</div>
						<div className="flex-1 bg-surface-alt rounded-full h-2 overflow-hidden">
							<div
								className="h-full"
								style={{ backgroundColor: color, width: `${percentage}%` }}
							/>
						</div>
						<div className="flex items-center gap-2 min-w-28">
							<span className="text-sm font-semibold text-text">
								{formatZoneTime(seconds)}
							</span>
							<span className="text-sm text-muted">
								{percentage.toFixed(1)}%
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
