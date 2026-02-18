interface PhysiologySettingsProps {
	lthr: number;
	fuelEasy: number;
	fuelLong: number;
	fuelInterval: number;
	onLthrChange: (value: number) => void;
	onFuelEasyChange: (value: number) => void;
	onFuelLongChange: (value: number) => void;
	onFuelIntervalChange: (value: number) => void;
}

export function PhysiologySettings({
	lthr,
	fuelEasy,
	fuelLong,
	fuelInterval,
	onLthrChange,
	onFuelEasyChange,
	onFuelLongChange,
	onFuelIntervalChange,
}: PhysiologySettingsProps) {
	const inputClass =
		"w-full p-1 border border-[#3d2b5a] bg-[#1a1030] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#ff2d95]";

	return (
		<div>
			<label className="block text-sm font-semibold uppercase text-[#b8a5d4] mb-1">
				Physiology
			</label>
			<div className="space-y-2 text-sm">
				<div className="flex items-center gap-2 text-[#c4b5fd]">
					<span>LTHR:</span>
					<input
						type="number"
						value={lthr}
						onChange={(e) => onLthrChange(Number(e.target.value))}
						className="w-20 p-1 border border-[#3d2b5a] bg-[#1a1030] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
					/>
				</div>
				<div className="text-xs font-semibold uppercase text-[#8b7ba8] mt-2">
					Fuel rates (g/h)
				</div>
				<div className="grid grid-cols-3 gap-2">
					<div>
						<span className="block text-xs text-[#b8a5d4]">Easy</span>
						<input
							type="number"
							value={fuelEasy}
							onChange={(e) => onFuelEasyChange(Number(e.target.value))}
							className={inputClass}
						/>
					</div>
					<div>
						<span className="block text-xs text-[#b8a5d4]">Long</span>
						<input
							type="number"
							value={fuelLong}
							onChange={(e) => onFuelLongChange(Number(e.target.value))}
							className={inputClass}
						/>
					</div>
					<div>
						<span className="block text-xs text-[#b8a5d4]">Interval</span>
						<input
							type="number"
							value={fuelInterval}
							onChange={(e) => onFuelIntervalChange(Number(e.target.value))}
							className={inputClass}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
