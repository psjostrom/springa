import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
} from "recharts";

interface WeeklyVolumeChartProps {
	data: { name: string; mins: number }[];
}

interface BarShapeProps {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	fill?: string;
}

export function WeeklyVolumeChart({ data }: WeeklyVolumeChartProps) {
	const coloredData = data.map((item, index) => ({
		...item,
		barFill: index >= data.length - 2 ? "#f23b94" : "#8b5cf6",
	}));

	return (
		<section className="bg-[#1d1828] p-6 rounded-xl shadow-sm border border-[#2e293c]">
			<h2 className="text-lg font-bold mb-6 text-white">
				Weekly Volume (Estimated Minutes)
			</h2>
			<div className="h-64 w-full min-h-0">
				<ResponsiveContainer width="100%" height="100%" minHeight={256}>
					<BarChart data={coloredData}>
						<XAxis
							dataKey="name"
							fontSize={12}
							tickLine={false}
							axisLine={false}
							tick={{ fill: "#af9ece" }}
						/>
						<YAxis hide />
						<Tooltip
							cursor={{ fill: "#2e293c" }}
							contentStyle={{
								borderRadius: "8px",
								border: "1px solid #2e293c",
								backgroundColor: "#1d1828",
								color: "#fff",
								boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.3)",
							}}
						/>
						<Bar
							dataKey="mins"
							radius={[4, 4, 0, 0]}
							shape={(props: BarShapeProps & { barFill?: string }) => {
								const { x = 0, y = 0, width = 0, height = 0, barFill } = props;
								const rx = 4;
								return (
									<rect x={x} y={y} width={width} height={height} fill={barFill ?? "#8b5cf6"} rx={rx} ry={rx} />
								);
							}}
						/>
					</BarChart>
				</ResponsiveContainer>
			</div>
		</section>
	);
}
