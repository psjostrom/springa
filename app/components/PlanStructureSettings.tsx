import { Settings } from "lucide-react";

interface PlanStructureSettingsProps {
	prefix: string;
	totalWeeks: number;
	startKm: number;
	onPrefixChange: (value: string) => void;
	onTotalWeeksChange: (value: number) => void;
	onStartKmChange: (value: number) => void;
}

export function PlanStructureSettings({
	prefix,
	totalWeeks,
	startKm,
	onPrefixChange,
	onTotalWeeksChange,
	onStartKmChange,
}: PlanStructureSettingsProps) {
	return (
		<div className="bg-[#2a1f3d] p-3 rounded border border-[#3d2b5a]">
			<label className="block text-sm font-semibold uppercase text-[#b8a5d4] mb-2 flex items-center gap-1">
				<Settings size={12} /> Plan Structure
			</label>
			<div className="space-y-2 text-sm">
				<div>
					<span className="block text-sm text-[#b8a5d4]">Tag Prefix</span>
					<input
						type="text"
						value={prefix}
						onChange={(e) => onPrefixChange(e.target.value)}
						className="w-full p-1 border border-[#3d2b5a] bg-[#1a1030] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
					/>
				</div>
				<div className="flex gap-2">
					<div className="flex-1">
						<span className="block text-sm text-[#b8a5d4]">Weeks</span>
						<input
							type="number"
							value={totalWeeks}
							onChange={(e) => onTotalWeeksChange(Number(e.target.value))}
							className="w-full p-1 border border-[#3d2b5a] bg-[#1a1030] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
						/>
					</div>
					<div className="flex-1">
						<span className="block text-sm text-[#b8a5d4]">Start km</span>
						<input
							type="number"
							value={startKm}
							onChange={(e) => onStartKmChange(Number(e.target.value))}
							className="w-full p-1 border border-[#3d2b5a] bg-[#1a1030] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
