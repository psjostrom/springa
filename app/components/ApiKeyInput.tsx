interface ApiKeyInputProps {
	value: string;
	onChange: (value: string) => void;
	hasEnvKey: boolean;
}

export function ApiKeyInput({ value, onChange, hasEnvKey }: ApiKeyInputProps) {
	return (
		<div>
			<label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
				API Key
			</label>
			{hasEnvKey ? (
				<div className="text-xs text-green-600 font-mono bg-green-50 p-2 rounded border border-green-200">
					✅ Loaded from Env
				</div>
			) : (
				<input
					type="password"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="w-full p-2 border rounded bg-slate-50 text-sm"
					placeholder="Intervals.icu Key"
				/>
			)}
		</div>
	);
}
