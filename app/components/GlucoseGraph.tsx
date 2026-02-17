interface GlucoseDataPoint {
	time: number;
	glucose: number;
}

interface GlucoseGraphProps {
	data: GlucoseDataPoint[];
}

export function GlucoseGraph({ data }: GlucoseGraphProps) {
	if (!data || data.length === 0) return null;

	const width = 600;
	const height = 150;
	const padding = { top: 10, right: 20, bottom: 30, left: 50 };
	const chartWidth = width - padding.left - padding.right;
	const chartHeight = height - padding.top - padding.bottom;

	// Find min/max values
	const glucoseValues = data.map(d => d.glucose);
	const minGlucose = Math.min(...glucoseValues);
	const maxGlucose = Math.max(...glucoseValues);
	const maxTime = Math.max(...data.map(d => d.time));

	// Add some padding to the y-axis range
	const yPadding = (maxGlucose - minGlucose) * 0.1;
	const yMin = Math.max(0, minGlucose - yPadding);
	const yMax = maxGlucose + yPadding;

	// Scale functions
	const scaleX = (time: number) => (time / maxTime) * chartWidth + padding.left;
	const scaleY = (glucose: number) => {
		const normalized = (glucose - yMin) / (yMax - yMin);
		return height - padding.bottom - normalized * chartHeight;
	};

	// Create path
	const pathData = data
		.map((d, i) => {
			const x = scaleX(d.time);
			const y = scaleY(d.glucose);
			return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
		})
		.join(' ');

	// Create grid lines and labels
	const yTicks = 4;
	const yStep = (yMax - yMin) / yTicks;

	return (
		<div className="w-full">
			<div className="text-sm font-semibold text-[#c4b5fd] mb-2">
				Blood Glucose
			</div>
			<svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
				{/* Grid lines */}
				{Array.from({ length: yTicks + 1 }).map((_, i) => {
					const y = scaleY(yMin + i * yStep);
					return (
						<g key={i}>
							<line
								x1={padding.left}
								y1={y}
								x2={width - padding.right}
								y2={y}
								stroke="#3d2b5a"
								strokeWidth="1"
							/>
							<text
								x={padding.left - 10}
								y={y + 4}
								textAnchor="end"
								fontSize="10"
								fill="#b8a5d4"
							>
								{Math.round(yMin + i * yStep)}
							</text>
						</g>
					);
				})}

				{/* Target range zone (3.9-10 mmol/L) */}
				<rect
					x={padding.left}
					y={scaleY(10)}
					width={chartWidth}
					height={scaleY(3.9) - scaleY(10)}
					fill="#1a3d25"
					opacity="0.3"
				/>

				{/* Glucose line */}
				<path
					d={pathData}
					fill="none"
					stroke="#c4b5fd"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>

				{/* X-axis label */}
				<text
					x={width / 2}
					y={height - 5}
					textAnchor="middle"
					fontSize="10"
					fill="#b8a5d4"
				>
					Time (minutes)
				</text>

				{/* Y-axis label */}
				<text
					x={10}
					y={height / 2}
					textAnchor="middle"
					fontSize="10"
					fill="#b8a5d4"
					transform={`rotate(-90, 10, ${height / 2})`}
				>
					mmol/L
				</text>
			</svg>
			<div className="flex justify-between text-sm text-[#b8a5d4] mt-1 px-12">
				<span>0m</span>
				<span>{Math.round(maxTime / 2)}m</span>
				<span>{maxTime}m</span>
			</div>
		</div>
	);
}
