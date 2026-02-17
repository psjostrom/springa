import { TrendingUp } from "lucide-react";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
} from "recharts";

interface AnalysisSectionProps {
	longRunAnalysis: {
		trend: number;
		plotData: { time: number; glucose: number }[];
	} | null;
	easyRunAnalysis: {
		trend: number;
		plotData: { time: number; glucose: number }[];
	} | null;
	intervalAnalysis: {
		trend: number;
		plotData: { time: number; glucose: number }[];
	} | null;
	fuelInterval: number;
	fuelLong: number;
	fuelEasy: number;
	onFuelIntervalChange: (value: number) => void;
	onFuelLongChange: (value: number) => void;
	onFuelEasyChange: (value: number) => void;
}

function GlucoseChart({
	plotData,
	title,
}: {
	plotData: { time: number; glucose: number }[];
	title: string;
}) {
	if (plotData.length === 0) return null;

	return (
		<div>
			<div className="text-sm font-medium text-[#c4b5fd] mb-1">{title}</div>
			<div className="h-32 w-full bg-[#1a1030] rounded border border-[#3d2b5a] p-1 min-h-0">
				<ResponsiveContainer width="100%" height="100%" minHeight={120}>
					<LineChart
						data={plotData}
						margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
					>
						<XAxis
							dataKey="time"
							tick={{ fontSize: 10, fill: "#b8a5d4" }}
							interval="preserveStartEnd"
							tickLine={false}
							axisLine={{ stroke: "#3d2b5a" }}
						/>
						<YAxis
							domain={["dataMin - 1", "dataMax + 1"]}
							tick={{ fontSize: 10, fill: "#b8a5d4" }}
							width={35}
							tickLine={false}
							axisLine={false}
							tickFormatter={(number) => number.toFixed(1)}
						/>
						<Tooltip
							contentStyle={{
								fontSize: "12px",
								borderRadius: "8px",
								border: "1px solid #3d2b5a",
								backgroundColor: "#1e1535",
								color: "#fff",
							}}
							formatter={(
								value: number | string | Array<number | string> | undefined,
							) => {
								if (value === undefined || value === null)
									return ["-", "mmol/L"];
								if (Array.isArray(value)) return [value.join(", "), "mmol/L"];
								const num = Number(value);
								return [!isNaN(num) ? num.toFixed(1) : value, "mmol/L"];
							}}
							labelFormatter={(label) => `${label} min`}
						/>
						<Line
							type="monotone"
							dataKey="glucose"
							stroke="#ff2d95"
							strokeWidth={2}
							dot={false}
						/>
					</LineChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}

function TrendBadge({ trend }: { trend: number }) {
	const color =
		trend < -3
			? "text-[#ff3366] font-bold"
			: trend > 3
				? "text-[#ffb800] font-bold"
				: "text-[#39ff14]";
	return <span className={color}>{trend.toFixed(1)}</span>;
}

export function AnalysisSection({
	longRunAnalysis,
	easyRunAnalysis,
	intervalAnalysis,
	fuelInterval,
	fuelLong,
	fuelEasy,
	onFuelIntervalChange,
	onFuelLongChange,
	onFuelEasyChange,
}: AnalysisSectionProps) {
	const hasAnalysis =
		longRunAnalysis !== null ||
		easyRunAnalysis !== null ||
		intervalAnalysis !== null;

	if (!hasAnalysis) return null;

	const fuelInputClass =
		"w-14 p-1 text-center text-sm font-bold border border-[#3d2b5a] bg-[#1a1030] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#ff2d95]";

	return (
		<div className="bg-[#2a1f3d] p-4 rounded-lg">
			<h3 className="font-semibold mb-3 flex items-center gap-2 text-sm text-white">
				<TrendingUp size={16} className="text-[#00ffff]" /> BG Analysis
			</h3>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				{longRunAnalysis && (
					<div className="space-y-2 min-w-0">
						<GlucoseChart
							plotData={longRunAnalysis.plotData}
							title="Last Long Run"
						/>
						<div className="flex justify-between items-center text-sm bg-[#1a1030] p-2 rounded border border-[#3d2b5a] gap-2">
							<div className="flex items-center gap-1 shrink-0">
								<span className="text-[#b8a5d4]">Fuel:</span>
								<input
									type="number"
									value={fuelLong}
									onChange={(e) => onFuelLongChange(Number(e.target.value))}
									className={fuelInputClass}
								/>
								<span className="text-[#b8a5d4]">g/h</span>
							</div>
							<div className="flex items-center gap-1 shrink-0">
								<TrendBadge trend={longRunAnalysis.trend} />
							</div>
						</div>
					</div>
				)}

				{easyRunAnalysis && (
					<div className="space-y-2 min-w-0">
						<GlucoseChart
							plotData={easyRunAnalysis.plotData}
							title="Last Easy Run"
						/>
						<div className="flex justify-between items-center text-sm bg-[#1a1030] p-2 rounded border border-[#3d2b5a] gap-2">
							<div className="flex items-center gap-1 shrink-0">
								<span className="text-[#b8a5d4]">Fuel:</span>
								<input
									type="number"
									value={fuelEasy}
									onChange={(e) => onFuelEasyChange(Number(e.target.value))}
									className={fuelInputClass}
								/>
								<span className="text-[#b8a5d4]">g/h</span>
							</div>
							<div className="flex items-center gap-1 shrink-0">
								<TrendBadge trend={easyRunAnalysis.trend} />
							</div>
						</div>
					</div>
				)}

				{intervalAnalysis && (
					<div className="space-y-2 min-w-0">
						<GlucoseChart
							plotData={intervalAnalysis.plotData}
							title="Last Interval/Tempo"
						/>
						<div className="flex justify-between items-center text-sm bg-[#1a1030] p-2 rounded border border-[#3d2b5a] gap-2">
							<div className="flex items-center gap-1 shrink-0">
								<span className="text-[#b8a5d4]">Fuel:</span>
								<input
									type="number"
									value={fuelInterval}
									onChange={(e) => onFuelIntervalChange(Number(e.target.value))}
									className={fuelInputClass}
								/>
								<span className="text-[#b8a5d4]">g/h</span>
							</div>
							<div className="flex items-center gap-1 shrink-0">
								<TrendBadge trend={intervalAnalysis.trend} />
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
