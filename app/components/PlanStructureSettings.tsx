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
		<div className="bg-slate-50 p-3 rounded border border-slate-200">
			<label className="block text-xs font-semibold uppercase text-slate-500 mb-2 flex items-center gap-1">
				<Settings size={12} /> Plan Structure
			</label>
			<div className="space-y-2 text-sm">
				<div>
					<span className="block text-xs text-slate-400">Tag Prefix</span>
					<input
						type="text"
						value={prefix}
						onChange={(e) => onPrefixChange(e.target.value)}
						className="w-full p-1 border rounded"
					/>
				</div>
				<div className="flex gap-2">
					<div className="flex-1">
						<span className="block text-xs text-slate-400">Weeks</span>
						<input
							type="number"
							value={totalWeeks}
							onChange={(e) => onTotalWeeksChange(Number(e.target.value))}
							className="w-full p-1 border rounded"
						/>
					</div>
					<div className="flex-1">
						<span className="block text-xs text-slate-400">Start km</span>
						<input
							type="number"
							value={startKm}
							onChange={(e) => onStartKmChange(Number(e.target.value))}
							className="w-full p-1 border rounded"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
