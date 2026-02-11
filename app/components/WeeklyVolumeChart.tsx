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
		<section className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
			<h2 className="text-lg font-bold mb-6">
				Weekly Volume (Estimated Minutes)
			</h2>
			<div className="h-64 w-full">
				<ResponsiveContainer width="100%" height="100%">
					<BarChart data={data}>
						<XAxis
							dataKey="name"
							fontSize={12}
							tickLine={false}
							axisLine={false}
						/>
						<YAxis hide />
						<Tooltip
							cursor={{ fill: "#f1f5f9" }}
							contentStyle={{
								borderRadius: "8px",
								border: "none",
								boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
							}}
						/>
						<Bar dataKey="mins" fill="#3b82f6" radius={[4, 4, 0, 0]}>
							{data.map((_, index: number) => (
								<Cell
									key={`cell-${index}`}
									fill={index >= data.length - 2 ? "#93c5fd" : "#3b82f6"}
								/>
							))}
						</Bar>
					</BarChart>
				</ResponsiveContainer>
			</div>
		</section>
	);
}
