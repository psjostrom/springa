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
			<label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
				Physiology
			</label>
			<div className="flex items-center gap-2 text-sm">
				<span>LTHR:</span>
				<input
					type="number"
					value={lthr}
					onChange={(e) => onLthrChange(Number(e.target.value))}
					className="w-20 p-1 border rounded"
				/>
			</div>
		</div>
	);
}
