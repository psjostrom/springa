"use client";

import { useState, useMemo } from "react";
import {
	generatePlan,
	uploadToIntervals,
	analyzeHistory,
	WorkoutEvent,
} from "@/lib/plannerLogic";
import {
	BarChart,
	Bar,
	LineChart,
	Line,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	Cell,
} from "recharts";
import {
	CalendarCheck,
	UploadCloud,
	TrendingUp,
	Settings,
	Route,
} from "lucide-react"; // Activity borttagen här
import {
	getISOWeek,
	format,
	parseISO,
	startOfWeek,
	addWeeks,
	differenceInCalendarWeeks,
	isBefore,
} from "date-fns";

export default function Home() {
	const [apiKey, setApiKey] = useState(
		process.env.NEXT_PUBLIC_INTERVALS_API_KEY || "",
	);
	const [raceName, setRaceName] = useState("EcoTrail");
	const [raceDate, setRaceDate] = useState("2026-06-13");
	const [raceDist, setRaceDist] = useState(16);
	const [lthr, setLthr] = useState(169);
	const [prefix, setPrefix] = useState("eco16");
	const [totalWeeks, setTotalWeeks] = useState(18);
	const [startKm, setStartKm] = useState(8);
	const [fuel, setFuel] = useState(10);
	const [planEvents, setPlanEvents] = useState<WorkoutEvent[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [statusMsg, setStatusMsg] = useState("");
	const [trend, setTrend] = useState<number | null>(null);
	const [plotData, setPlotData] = useState<{ time: number; glucose: number }[]>(
		[],
	);

	// --- PHASE CALCULATOR ---
	const phaseInfo = useMemo(() => {
		const today = new Date();
		const rDate = parseISO(raceDate);
		const raceWeekMonday = startOfWeek(rDate, { weekStartsOn: 1 });
		const planStartMonday = addWeeks(raceWeekMonday, -(totalWeeks - 1));

		if (isBefore(today, planStartMonday)) {
			return { name: "Pre-Plan", week: 0, progress: 0 };
		}
		if (isBefore(rDate, today)) {
			return { name: "Post-Race", week: totalWeeks, progress: 100 };
		}

		const currentWeek =
			differenceInCalendarWeeks(today, planStartMonday, { weekStartsOn: 1 }) +
			1;
		let name = "Build Phase";
		if (currentWeek === totalWeeks) name = "🏁 Race Week";
		else if (currentWeek === totalWeeks - 1) name = "📉 Taper Phase";
		else if (currentWeek >= totalWeeks - 3) name = "🏔️ Race Test Phase";

		const progress = Math.min(
			100,
			Math.max(0, (currentWeek / totalWeeks) * 100),
		);
		return { name, week: currentWeek, progress };
	}, [raceDate, totalWeeks]);

	// --- ACTIONS ---
	const handleAnalyze = async () => {
		if (!apiKey) {
			setStatusMsg("❌ Missing API Key");
			return;
		}
		setIsAnalyzing(true);
		const result = await analyzeHistory(apiKey, prefix);
		setTrend(result.trend);
		setPlotData(result.plotData);

		let sugg = result.currentFuel;
		if (result.trend < -3.0) {
			const diff = Math.abs(result.trend - -3.0);
			sugg += Math.min(1 + Math.floor(diff * 0.7), 4);
		} else if (result.trend > 3.0) {
			sugg = Math.max(0, sugg - 1);
		}
		setFuel(sugg);
		setIsAnalyzing(false);
	};

	const handleGenerate = () => {
		const events = generatePlan(
			fuel,
			raceDate,
			raceDist,
			prefix,
			totalWeeks,
			startKm,
			lthr,
		);
		setPlanEvents(events);
		setStatusMsg("");
	};

	const handleUpload = async () => {
		if (!apiKey) {
			setStatusMsg("❌ Missing API Key");
			return;
		}
		setIsUploading(true);
		try {
			const count = await uploadToIntervals(apiKey, planEvents);
			setStatusMsg(`✅ Success! Uploaded ${count} workouts.`);
		} catch (e) {
			setStatusMsg(`❌ Error: ${e}`);
		}
		setIsUploading(false);
	};

	// Chart Prep
	const chartData = planEvents
		.reduce((acc: any[], event) => {
			const weekNum = getISOWeek(event.start_date_local);
			const label = `W${weekNum.toString().padStart(2, "0")}`;
			let mins = 45;
			if (event.name.includes("Easy")) mins = 45;
			if (event.name.includes("LR")) {
				const match = event.name.match(/(\d+)km/);
				if (match) mins = parseInt(match[1]) * 6;
			}
			const existing = acc.find((d: any) => d.name === label);
			if (existing) existing.mins += mins;
			else acc.push({ name: label, mins });
			return acc;
		}, [])
		.sort((a: any, b: any) => a.name.localeCompare(b.name));

	return (
		<div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-900 font-sans">
			{/* SIDEBAR */}
			<aside className="w-full md:w-80 bg-white border-r border-slate-200 p-6 flex flex-col gap-6 overflow-y-auto h-screen sticky top-0">
				<div className="flex items-center gap-2 mb-2">
					{/* Ikonen borttagen här */}
					<h1 className="text-xl font-bold tracking-tight">🏃‍♂️‍➡️ Race Planner</h1>
				</div>

				{/* PHASE TRACKER */}
				<div className="bg-slate-800 text-white p-4 rounded-lg shadow-sm">
					<div className="flex items-center gap-2 mb-2">
						<Route className="text-blue-400" size={18} />
						<h3 className="font-bold text-sm">{phaseInfo.name}</h3>
					</div>
					<div className="flex justify-between text-xs text-slate-400 mb-1">
						<span>Progress</span>
						<span>
							Week {phaseInfo.week} of {totalWeeks}
						</span>
					</div>
					<div className="w-full bg-slate-700 rounded-full h-2">
						<div
							className="bg-blue-500 h-2 rounded-full transition-all duration-500"
							style={{ width: `${phaseInfo.progress}%` }}
						></div>
					</div>
				</div>

				<div className="space-y-4">
					<div>
						<label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
							API Key
						</label>
						{process.env.NEXT_PUBLIC_INTERVALS_API_KEY ? (
							<div className="text-xs text-green-600 font-mono bg-green-50 p-2 rounded border border-green-200">
								✅ Loaded from Env
							</div>
						) : (
							<input
								type="password"
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
								className="w-full p-2 border rounded bg-slate-50 text-sm"
								placeholder="Intervals.icu Key"
							/>
						)}
					</div>

					<div>
						<label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
							Race Settings
						</label>
						<input
							type="text"
							value={raceName}
							onChange={(e) => setRaceName(e.target.value)}
							className="w-full p-2 border rounded mb-2 text-sm"
							placeholder="Name"
						/>
						<input
							type="date"
							value={raceDate}
							onChange={(e) => setRaceDate(e.target.value)}
							className="w-full p-2 border rounded mb-2 text-sm"
						/>
						<div className="flex items-center gap-2 text-sm">
							<span>Dist (km):</span>
							<input
								type="number"
								value={raceDist}
								onChange={(e) => setRaceDist(Number(e.target.value))}
								className="w-20 p-1 border rounded"
							/>
						</div>
					</div>

					<div>
						<label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
							Physiology
						</label>
						<div className="flex items-center gap-2 text-sm">
							<span>LTHR:</span>
							<input
								type="number"
								value={lthr}
								onChange={(e) => setLthr(Number(e.target.value))}
								className="w-20 p-1 border rounded"
							/>
						</div>
					</div>

					<div className="bg-slate-50 p-3 rounded border border-slate-200">
						<label className="block text-xs font-semibold uppercase text-slate-500 mb-2 flex items-center gap-1">
							<Settings size={12} /> Plan Structure
						</label>
						<div className="space-y-2 text-sm">
							<div>
								<span className="block text-xs text-slate-400">Tag Prefix</span>
								<input
									type="text"
									value={prefix}
									onChange={(e) => setPrefix(e.target.value)}
									className="w-full p-1 border rounded"
								/>
							</div>
							<div className="flex gap-2">
								<div className="flex-1">
									<span className="block text-xs text-slate-400">Weeks</span>
									<input
										type="number"
										value={totalWeeks}
										onChange={(e) => setTotalWeeks(Number(e.target.value))}
										className="w-full p-1 border rounded"
									/>
								</div>
								<div className="flex-1">
									<span className="block text-xs text-slate-400">Start km</span>
									<input
										type="number"
										value={startKm}
										onChange={(e) => setStartKm(Number(e.target.value))}
										className="w-full p-1 border rounded"
									/>
								</div>
							</div>
						</div>
					</div>
				</div>

				<hr />

				{/* ANALYSIS SECTION */}
				<div className="bg-slate-100 p-4 rounded-lg">
					<h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
						<TrendingUp size={16} /> Analysis
					</h3>
					{trend === null ? (
						<button
							onClick={handleAnalyze}
							disabled={isAnalyzing}
							className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
						>
							{isAnalyzing ? "Fetching..." : `Analyze '${prefix}'`}
						</button>
					) : (
						<div className="space-y-3">
							{/* MINI GLUCOSE CHART */}
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
												formatter={(value: number) => [
													value.toFixed(1),
													"mmol/L",
												]}
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
									className={
										trend < -3 ? "text-red-600 font-bold" : "text-green-600"
									}
								>
									{trend.toFixed(1)}
								</span>
							</div>
							<div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-300">
								<span className="font-bold text-sm">Fuel:</span>
								<input
									type="number"
									value={fuel}
									onChange={(e) => setFuel(Number(e.target.value))}
									className="w-16 p-1 text-center font-bold border rounded bg-white"
								/>
								<span className="text-xs text-slate-500">g/10m</span>
							</div>
						</div>
					)}
				</div>

				<button
					onClick={handleGenerate}
					className="mt-auto w-full py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition shadow-lg"
				>
					Generate Plan
				</button>
			</aside>

			{/* MAIN CONTENT */}
			<main className="flex-1 p-8 overflow-y-auto h-screen">
				{planEvents.length === 0 ? (
					<div className="h-full flex flex-col items-center justify-center text-slate-400">
						<CalendarCheck size={64} className="mb-4 opacity-20" />
						<p>Configure settings and generate your plan.</p>
					</div>
				) : (
					<div className="max-w-4xl mx-auto space-y-8 pb-20">
						{/* DASHBOARD */}
						<section className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
							<h2 className="text-lg font-bold mb-6">
								Weekly Volume (Estimated Minutes)
							</h2>
							<div className="h-64 w-full">
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={chartData}>
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
											{chartData.map((entry: any, index: number) => (
												<Cell
													key={`cell-${index}`}
													fill={
														index >= chartData.length - 2
															? "#93c5fd"
															: "#3b82f6"
													}
												/>
											))}
										</Bar>
									</BarChart>
								</ResponsiveContainer>
							</div>
						</section>

						{/* ACTION BAR */}
						<div className="sticky top-4 z-10 flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100 shadow-sm backdrop-blur-sm bg-opacity-90">
							<div>
								<h3 className="font-bold text-blue-900">Ready to sync?</h3>
								<p className="text-sm text-blue-700">
									{planEvents.length} workouts generated.
								</p>
							</div>
							<button
								onClick={handleUpload}
								disabled={isUploading}
								className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-md font-bold hover:bg-blue-700 disabled:opacity-50 transition shadow-sm"
							>
								{isUploading ? (
									"Syncing..."
								) : (
									<>
										<UploadCloud size={18} /> Sync
									</>
								)}
							</button>
						</div>

						{statusMsg && (
							<div
								className={`p-4 rounded-lg text-sm font-medium ${statusMsg.includes("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}
							>
								{statusMsg}
							</div>
						)}

						{/* WORKOUT LIST */}
						<div className="space-y-4">
							<h3 className="text-sm font-bold uppercase text-slate-400 tracking-wider">
								Preview
							</h3>
							{planEvents.map((ev, i) => (
								<div
									key={i}
									className="bg-white p-4 rounded border border-slate-100 flex flex-col md:flex-row md:items-start gap-4 hover:border-blue-200 transition"
								>
									<div className="w-24 shrink-0 text-slate-500 text-sm font-mono pt-1">
										{format(ev.start_date_local, "yyyy-MM-dd")}
									</div>
									<div className="flex-1">
										<h4 className="font-bold text-slate-900">{ev.name}</h4>
										<pre className="text-xs text-slate-500 mt-2 whitespace-pre-wrap font-sans bg-slate-50 p-2 rounded">
											{ev.description}
										</pre>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</main>
		</div>
	);
}
