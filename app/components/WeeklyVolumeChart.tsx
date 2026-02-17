import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	Cell,
} from "recharts";

interface WeeklyVolumeChartProps {
	data: { name: string; mins: number }[];
}

export function WeeklyVolumeChart({ data }: WeeklyVolumeChartProps) {
	return (
		<section className="bg-[#1e1535] p-6 rounded-xl shadow-sm border border-[#3d2b5a]">
			<h2 className="text-lg font-bold mb-6 text-white">
				Weekly Volume (Estimated Minutes)
			</h2>
			<div className="h-64 w-full min-h-0">
				<ResponsiveContainer width="100%" height="100%" minHeight={256}>
					<BarChart data={data}>
						<XAxis
							dataKey="name"
							fontSize={12}
							tickLine={false}
							axisLine={false}
							tick={{ fill: "#b8a5d4" }}
						/>
						<YAxis hide />
						<Tooltip
							cursor={{ fill: "#2a1f3d" }}
							contentStyle={{
								borderRadius: "8px",
								border: "1px solid #3d2b5a",
								backgroundColor: "#1e1535",
								color: "#fff",
								boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.3)",
							}}
						/>
						<Bar dataKey="mins" fill="#ff2d95" radius={[4, 4, 0, 0]}>
							{data.map((_, index: number) => (
								<Cell
									key={`cell-${index}`}
									fill={index >= data.length - 2 ? "#ff2d95" : "#00ffff"}
								/>
							))}
						</Bar>
					</BarChart>
				</ResponsiveContainer>
			</div>
		</section>
	);
}
