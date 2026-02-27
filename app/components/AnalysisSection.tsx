import { TrendingUp } from "lucide-react";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
} from "recharts";

type FuelType = "long" | "easy" | "interval";

interface AnalysisData {
	trend: number;
	plotData: { time: number; glucose: number }[];
}

interface AnalysisSectionProps {
	longRunAnalysis: AnalysisData | null;
	easyRunAnalysis: AnalysisData | null;
	intervalAnalysis: AnalysisData | null;
	fuelValues: Record<FuelType, number>;
	onFuelChange: (type: FuelType, value: number) => void;
}

const CARDS: { type: FuelType; key: "longRunAnalysis" | "easyRunAnalysis" | "intervalAnalysis"; title: string }[] = [
	{ type: "long", key: "longRunAnalysis", title: "Last Long Run" },
	{ type: "easy", key: "easyRunAnalysis", title: "Last Easy Run" },
	{ type: "interval", key: "intervalAnalysis", title: "Last Interval/Tempo" },
];

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
							tickFormatter={(v: number) => v.toFixed(1)}
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
								value: number | string | (number | string)[] | undefined,
							) => {
								if (value == null)
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
	fuelValues,
	onFuelChange,
}: AnalysisSectionProps) {
	const analysisMap = { longRunAnalysis, easyRunAnalysis, intervalAnalysis };
	const activeCards = CARDS.filter((c) => analysisMap[c.key] !== null);

	if (activeCards.length === 0) return null;

	const fuelInputClass =
		"w-14 p-1 text-center text-sm font-bold border border-[#3d2b5a] bg-[#1a1030] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#ff2d95]";

	return (
		<div className="bg-[#2a1f3d] p-4 rounded-lg">
			<h3 className="font-semibold mb-3 flex items-center gap-2 text-sm text-white">
				<TrendingUp size={16} className="text-[#00ffff]" /> BG Analysis
			</h3>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				{activeCards.map(({ type, key, title }) => {
					const analysis = analysisMap[key];
					if (!analysis) return null;
					return (
						<div key={type} className="space-y-2 min-w-0">
							<GlucoseChart plotData={analysis.plotData} title={title} />
							<div className="flex justify-between items-center text-sm bg-[#1a1030] p-2 rounded border border-[#3d2b5a] gap-2">
								<div className="flex items-center gap-1 shrink-0">
									<span className="text-[#b8a5d4]">Fuel:</span>
									<input
										type="number"
										value={fuelValues[type]}
										onChange={(e) => { onFuelChange(type, Number(e.target.value)); }}
										className={fuelInputClass}
									/>
									<span className="text-[#b8a5d4]">g/h</span>
								</div>
								<div className="flex items-center gap-1 shrink-0">
									<TrendBadge trend={analysis.trend} />
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
