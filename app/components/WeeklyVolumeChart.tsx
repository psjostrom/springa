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
		barFill: index >= data.length - 2 ? "#ff2d95" : "#00ffff",
	}));

	return (
		<section className="bg-[#1e1535] p-6 rounded-xl shadow-sm border border-[#3d2b5a]">
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
						<Bar
							dataKey="mins"
							radius={[4, 4, 0, 0]}
							shape={(props: BarShapeProps & { barFill?: string }) => {
								const { x = 0, y = 0, width = 0, height = 0, barFill } = props;
								const rx = 4;
								return (
									<rect x={x} y={y} width={width} height={height} fill={barFill ?? "#00ffff"} rx={rx} ry={rx} />
								);
							}}
						/>
					</BarChart>
				</ResponsiveContainer>
			</div>
		</section>
	);
}
