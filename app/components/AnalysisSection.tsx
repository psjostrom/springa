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
	trend: number | null;
	fuel: number;
	plotData: { time: number; glucose: number }[];
	isAnalyzing: boolean;
	onAnalyze: () => void;
	onFuelChange: (value: number) => void;
}

export function AnalysisSection({
	prefix,
	trend,
	fuel,
	plotData,
	isAnalyzing,
	onAnalyze,
	onFuelChange,
}: AnalysisSectionProps) {
	return (
		<div className="bg-slate-100 p-4 rounded-lg">
			<h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
				<TrendingUp size={16} /> Analysis
			</h3>
			{trend === null ? (
				<button
					onClick={onAnalyze}
					disabled={isAnalyzing}
					className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
				>
					{isAnalyzing ? "Fetching..." : `Analyze '${prefix}'`}
				</button>
			) : (
				<div className="space-y-3">
					{plotData.length > 0 && (
						<div className="h-32 w-full bg-white rounded border border-slate-200 p-1">
							<ResponsiveContainer width="100%" height="100%">
								<LineChart
									data={plotData}
									margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
								>
									<XAxis
										dataKey="time"
										tick={{ fontSize: 10, fill: "#64748b" }}
										interval="preserveStartEnd"
										tickLine={false}
										axisLine={{ stroke: "#e2e8f0" }}
									/>
									<YAxis
										domain={["dataMin - 1", "dataMax + 1"]}
										tick={{ fontSize: 10, fill: "#64748b" }}
										width={35}
										tickLine={false}
										axisLine={false}
										tickFormatter={(number) => number.toFixed(1)}
									/>
									<Tooltip
										contentStyle={{
											fontSize: "12px",
											borderRadius: "4px",
											border: "1px solid #e2e8f0",
										}}
										formatter={(
											value:
												| number
												| string
												| Array<number | string>
												| undefined,
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
										stroke="#ef4444"
										strokeWidth={2}
										dot={false}
									/>
								</LineChart>
							</ResponsiveContainer>
						</div>
					)}

					<div className="flex justify-between text-sm">
						<span>Trend:</span>
						<span
							className={trend < -3 ? "text-red-600 font-bold" : "text-green-600"}
						>
							{trend.toFixed(1)}
						</span>
					</div>
					<div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-300">
						<span className="font-bold text-sm">Fuel:</span>
						<input
							type="number"
							value={fuel}
							onChange={(e) => onFuelChange(Number(e.target.value))}
							className="w-16 p-1 text-center font-bold border rounded bg-white"
						/>
						<span className="text-xs text-slate-500">g/10m</span>
					</div>
				</div>
			)}
		</div>
	);
}
