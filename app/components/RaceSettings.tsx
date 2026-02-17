interface RaceSettingsProps {
	raceName: string;
	raceDate: string;
	raceDist: number;
	onRaceNameChange: (value: string) => void;
	onRaceDateChange: (value: string) => void;
	onRaceDistChange: (value: number) => void;
}

export function RaceSettings({
	raceName,
	raceDate,
	raceDist,
	onRaceNameChange,
	onRaceDateChange,
	onRaceDistChange,
}: RaceSettingsProps) {
	return (
		<div>
			<label className="block text-sm font-semibold uppercase text-[#b8a5d4] mb-1">
				Race Settings
			</label>
			<input
				type="text"
				value={raceName}
				onChange={(e) => onRaceNameChange(e.target.value)}
				className="w-full p-2 border border-[#3d2b5a] bg-[#1a1030] text-white rounded mb-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
				placeholder="Name"
			/>
			<input
				type="date"
				value={raceDate}
				onChange={(e) => onRaceDateChange(e.target.value)}
				className="w-full p-2 border border-[#3d2b5a] bg-[#1a1030] text-white rounded mb-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
			/>
			<div className="flex items-center gap-2 text-sm text-[#c4b5fd]">
				<span>Dist (km):</span>
				<input
					type="number"
					value={raceDist}
					onChange={(e) => onRaceDistChange(Number(e.target.value))}
					className="w-20 p-1 border border-[#3d2b5a] bg-[#1a1030] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
				/>
			</div>
		</div>
	);
}
