interface PhysiologySettingsProps {
	lthr: number;
	onLthrChange: (value: number) => void;
}

export function PhysiologySettings({
	lthr,
	onLthrChange,
}: PhysiologySettingsProps) {
	return (
		<div>
			<label className="block text-xs font-semibold uppercase text-[#8b7aaa] mb-1">
				Physiology
			</label>
			<div className="flex items-center gap-2 text-sm text-[#c4b5fd]">
				<span>LTHR:</span>
				<input
					type="number"
					value={lthr}
					onChange={(e) => onLthrChange(Number(e.target.value))}
					className="w-20 p-1 border border-[#3d2b5a] bg-[#1a1030] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#ff2d95]"
				/>
			</div>
		</div>
	);
}
