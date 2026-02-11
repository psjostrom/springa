"use client";

import { useState } from "react";
import {
	generatePlan,
	uploadToIntervals,
	analyzeHistory,
	WorkoutEvent,
} from "@/lib/plannerLogic";
import { PhaseTracker } from "./components/PhaseTracker";
import { ApiKeyInput } from "./components/ApiKeyInput";
import { RaceSettings } from "./components/RaceSettings";
import { PhysiologySettings } from "./components/PhysiologySettings";
import { PlanStructureSettings } from "./components/PlanStructureSettings";
import { AnalysisSection } from "./components/AnalysisSection";
import { WeeklyVolumeChart } from "./components/WeeklyVolumeChart";
import { WorkoutList } from "./components/WorkoutList";
import { ActionBar } from "./components/ActionBar";
import { StatusMessage } from "./components/StatusMessage";
import { EmptyState } from "./components/EmptyState";
import { usePhaseInfo } from "./hooks/usePhaseInfo";
import { useWeeklyVolumeData } from "./hooks/useWeeklyVolumeData";

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

	const phaseInfo = usePhaseInfo(raceDate, totalWeeks);
	const chartData = useWeeklyVolumeData(planEvents);

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

	return (
		<div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-900 font-sans">
			<aside className="w-full md:w-80 bg-white border-r border-slate-200 p-6 flex flex-col gap-6 md:h-screen md:sticky md:top-0 md:overflow-y-auto shrink-0 z-20">
				<div className="flex items-center gap-2 mb-2">
					<h1 className="text-xl font-bold tracking-tight">🏃‍♂️‍➡️ Race Planner</h1>
				</div>

				<PhaseTracker
					phaseName={phaseInfo.name}
					currentWeek={phaseInfo.week}
					totalWeeks={totalWeeks}
					progress={phaseInfo.progress}
				/>

				<div className="space-y-4">
					<ApiKeyInput
						value={apiKey}
						onChange={setApiKey}
						hasEnvKey={!!process.env.NEXT_PUBLIC_INTERVALS_API_KEY}
					/>

					<RaceSettings
						raceName={raceName}
						raceDate={raceDate}
						raceDist={raceDist}
						onRaceNameChange={setRaceName}
						onRaceDateChange={setRaceDate}
						onRaceDistChange={setRaceDist}
					/>

					<PhysiologySettings lthr={lthr} onLthrChange={setLthr} />

					<PlanStructureSettings
						prefix={prefix}
						totalWeeks={totalWeeks}
						startKm={startKm}
						onPrefixChange={setPrefix}
						onTotalWeeksChange={setTotalWeeks}
						onStartKmChange={setStartKm}
					/>
				</div>

				<hr />

				<AnalysisSection
					prefix={prefix}
					trend={trend}
					fuel={fuel}
					plotData={plotData}
					isAnalyzing={isAnalyzing}
					onAnalyze={handleAnalyze}
					onFuelChange={setFuel}
				/>

				<button
					onClick={handleGenerate}
					className="mt-auto w-full py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition shadow-lg mb-24 md:mb-0"
				>
					Generate Plan
				</button>
			</aside>

			<main className="flex-1 p-4 md:p-8 md:overflow-y-auto md:h-screen bg-slate-50">
				{planEvents.length === 0 ? (
					<EmptyState />
				) : (
					<div className="max-w-4xl mx-auto space-y-8 pb-32 md:pb-20">
						<WeeklyVolumeChart data={chartData} />
						<ActionBar
							workoutCount={planEvents.length}
							isUploading={isUploading}
							onUpload={handleUpload}
						/>
						<StatusMessage message={statusMsg} />
						<WorkoutList events={planEvents} />
					</div>
				)}
			</main>
		</div>
	);
}
