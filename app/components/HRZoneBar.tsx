import { ZONE_COLORS } from "@/lib/constants";

interface HRZoneBarProps {
	z1: number;
	z2: number;
	z3: number;
	z4: number;
	z5: number;
	height?: string;
}

const ZONES = ["z1", "z2", "z3", "z4", "z5"] as const;

export function HRZoneBar({ z1, z2, z3, z4, z5, height = "h-2" }: HRZoneBarProps) {
	const total = z1 + z2 + z3 + z4 + z5;
	if (total === 0) return null;

	const values = { z1, z2, z3, z4, z5 };

	return (
		<div className={`flex ${height} rounded-full overflow-hidden w-full`}>
			{ZONES.map((z) => {
				const pct = (values[z] / total) * 100;
				if (pct <= 0) return null;
				return (
					<div
						key={z}
						style={{ backgroundColor: ZONE_COLORS[z], width: `${pct}%` }}
						title={`${z.toUpperCase()}: ${Math.round(pct)}%`}
					/>
				);
			})}
		</div>
	);
}
