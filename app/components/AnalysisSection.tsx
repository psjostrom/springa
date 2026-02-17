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
	prefix: string;
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
	isAnalyzing: boolean;
	onAnalyze: () => void;
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
	prefix,
	longRunAnalysis,
	easyRunAnalysis,
	intervalAnalysis,
	fuelInterval,
	fuelLong,
	fuelEasy,
	isAnalyzing,
	onAnalyze,
	onFuelIntervalChange,
	onFuelLongChange,
	onFuelEasyChange,
}: AnalysisSectionProps) {
	const hasAnalysis =
		longRunAnalysis !== null ||
		easyRunAnalysis !== null ||
		intervalAnalysis !== null;

	const fuelInputClass =
		"w-10 p-1 text-center text-sm font-bold border border-[#3d2b5a] bg-[#1a1030] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#ff2d95]";

	return (
		<div className="bg-[#2a1f3d] p-4 rounded-lg">
			<h3 className="font-semibold mb-2 flex items-center gap-2 text-sm text-white">
				<TrendingUp size={16} className="text-[#00ffff]" /> Analysis
			</h3>
			{!hasAnalysis ? (
				<button
					onClick={onAnalyze}
					disabled={isAnalyzing}
					className="w-full bg-[#ff2d95] text-white py-2 rounded text-sm font-medium hover:bg-[#e0207a] transition disabled:opacity-50"
				>
					{isAnalyzing ? "Fetching..." : `Analyze '${prefix}'`}
				</button>
			) : (
				<div className="space-y-4">
					{/* Long Run Analysis */}
					{longRunAnalysis && (
						<div className="space-y-2">
							<GlucoseChart
								plotData={longRunAnalysis.plotData}
								title="Last Long Run"
							/>
							<div className="flex justify-between items-center text-sm bg-[#1a1030] p-2 rounded border border-[#3d2b5a] gap-2">
								<div className="flex items-center gap-1 shrink-0">
									<span className="text-[#b8a5d4]">Long:</span>
									<input
										type="number"
										value={fuelLong}
										onChange={(e) => onFuelLongChange(Number(e.target.value))}
										className={fuelInputClass}
									/>
									<span className="text-[#b8a5d4]">g/10m</span>
								</div>
								<div className="flex items-center gap-1 shrink-0">
									<span className="text-[#b8a5d4]">Trend:</span>
									<TrendBadge trend={longRunAnalysis.trend} />
								</div>
							</div>
						</div>
					)}

					{/* Easy Run Analysis */}
					{easyRunAnalysis && (
						<div className="space-y-2">
							<GlucoseChart
								plotData={easyRunAnalysis.plotData}
								title="Last Easy Run"
							/>
							<div className="flex justify-between items-center text-sm bg-[#1a1030] p-2 rounded border border-[#3d2b5a] gap-2">
								<div className="flex items-center gap-1 shrink-0">
									<span className="text-[#b8a5d4]">Easy:</span>
									<input
										type="number"
										value={fuelEasy}
										onChange={(e) => onFuelEasyChange(Number(e.target.value))}
										className={fuelInputClass}
									/>
									<span className="text-[#b8a5d4]">g/10m</span>
								</div>
								<div className="flex items-center gap-1 shrink-0">
									<span className="text-[#b8a5d4]">Trend:</span>
									<TrendBadge trend={easyRunAnalysis.trend} />
								</div>
							</div>
						</div>
					)}

					{/* Interval Analysis */}
					{intervalAnalysis && (
						<div className="space-y-2">
							<GlucoseChart
								plotData={intervalAnalysis.plotData}
								title="Last Interval/Tempo"
							/>
							<div className="flex justify-between items-center text-sm bg-[#1a1030] p-2 rounded border border-[#3d2b5a] gap-2">
								<div className="flex items-center gap-1 shrink-0">
									<span className="text-[#b8a5d4]">Intervals:</span>
									<input
										type="number"
										value={fuelInterval}
										onChange={(e) => onFuelIntervalChange(Number(e.target.value))}
										className={fuelInputClass}
									/>
									<span className="text-[#b8a5d4]">g/10m</span>
								</div>
								<div className="flex items-center gap-1 shrink-0">
									<span className="text-[#b8a5d4]">Trend:</span>
									<TrendBadge trend={intervalAnalysis.trend} />
								</div>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
