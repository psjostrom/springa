"use client";

import { useState } from "react";
import { getPhaseDefinitions, isRecoveryWeek } from "@/lib/periodization";
import type { PhaseDefinition } from "@/lib/periodization";

interface PhaseTrackerProps {
	phaseName: string;
	currentWeek: number;
	totalWeeks: number;
	progress: number;
	raceDate?: string;
	includeBasePhase?: boolean;
}

function getCurrentPhaseIndex(currentWeek: number, phases: PhaseDefinition[]): number {
	for (let i = 0; i < phases.length; i++) {
		if (currentWeek >= phases[i].startWeek && currentWeek <= phases[i].endWeek) {
			return i;
		}
	}
	return 0;
}

function formatRaceDate(raceDate: string): string {
	const date = new Date(raceDate);
	return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function weeksUntil(raceDate: string): number {
	const now = new Date();
	const race = new Date(raceDate);
	const diffMs = race.getTime() - now.getTime();
	return Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
}

function PhasePopover({
	anchorRect,
	phases,
	currentPhaseIndex,
	currentWeek,
	totalWeeks,
	includeBasePhase,
	raceDate,
	onClose,
}: {
	anchorRect: DOMRect;
	phases: PhaseDefinition[];
	currentPhaseIndex: number;
	currentWeek: number;
	totalWeeks: number;
	includeBasePhase: boolean;
	raceDate?: string;
	onClose: () => void;
}) {
	const popoverWidth = 280;
	const popoverHeight = 280; // approximate max height
	const gap = 10;
	// Show below if not enough space above
	const showBelow = anchorRect.top < popoverHeight + gap;

	const anchorCenterX = anchorRect.left + anchorRect.width / 2;
	const left = Math.min(
		Math.max(12, anchorCenterX - popoverWidth / 2),
		window.innerWidth - popoverWidth - 12,
	);
	const arrowLeft = Math.min(Math.max(16, anchorCenterX - left), popoverWidth - 16);

	const positionStyle: React.CSSProperties = {
		width: popoverWidth,
		left,
		...(showBelow
			? { top: anchorRect.bottom + gap }
			: { bottom: window.innerHeight - anchorRect.top + gap }),
	};

	const currentPhase = phases[currentPhaseIndex];
	const upcomingPhases = phases.slice(currentPhaseIndex + 1);
	const weeksLeft = raceDate ? weeksUntil(raceDate) : null;
	const recovery = isRecoveryWeek(currentWeek, totalWeeks, includeBasePhase);

	return (
		<>
			<div className="fixed inset-0 z-40" onClick={onClose} />
			<div
				className="fixed z-50 bg-[#1d1828] border border-[#2e293c] rounded-xl px-4 py-3 shadow-lg shadow-black/50"
				style={positionStyle}
			>
				{/* Race countdown */}
				{raceDate && weeksLeft !== null && weeksLeft > 0 && (
					<div className="text-xs text-[#f23b94] font-semibold mb-2">
						{weeksLeft} week{weeksLeft !== 1 ? "s" : ""} to race day • {formatRaceDate(raceDate)}
					</div>
				)}

				{/* Current phase */}
				<div className="mb-3">
					<div className="text-sm font-bold text-white mb-1">
						{currentPhase.displayName}
						{recovery && <span className="text-xs font-normal text-[#fbbf24] ml-2">Recovery Week</span>}
					</div>
					<div className="text-xs text-[#af9ece] leading-relaxed mb-2">
						{currentPhase.description}
					</div>
					<div className="space-y-1">
						{currentPhase.focus.map((item, i) => (
							<div key={i} className="flex items-center gap-2 text-xs">
								<span className="w-1 h-1 rounded-full bg-[#f23b94]" />
								<span className="text-[#af9ece]">{item}</span>
							</div>
						))}
					</div>
				</div>

				{/* Upcoming phases */}
				{upcomingPhases.length > 0 && (
					<div className="pt-2 border-t border-[#2e293c]">
						<div className="text-xs text-[#7a6899] uppercase tracking-wider font-semibold mb-2">
							Coming up
						</div>
						<div className="space-y-2">
							{upcomingPhases.map((phase, i) => {
								const weeksToPhase = phase.startWeek - currentWeek;
								return (
									<div key={i} className="flex items-center justify-between">
										<span className="text-xs text-[#af9ece]">{phase.displayName}</span>
										<span className="text-xs text-[#7a6899]">
											{weeksToPhase === 1 ? "Next week" : `In ${weeksToPhase} weeks`}
										</span>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* Arrow */}
				<div
					className={`absolute w-2.5 h-2.5 bg-[#1d1828] border-[#2e293c] rotate-45 ${
						showBelow ? "-top-[6px] border-l border-t" : "-bottom-[6px] border-r border-b"
					}`}
					style={{ left: arrowLeft }}
				/>
			</div>
		</>
	);
}

export function PhaseTracker({
	phaseName,
	currentWeek,
	totalWeeks,
	progress,
	raceDate,
	includeBasePhase,
}: PhaseTrackerProps) {
	const [popover, setPopover] = useState<{ anchorRect: DOMRect } | null>(null);

	const phases = getPhaseDefinitions(totalWeeks, includeBasePhase ?? false);
	const currentPhaseIndex = getCurrentPhaseIndex(currentWeek, phases);

	const handleClick = (e: React.MouseEvent) => {
		if (popover) {
			setPopover(null);
		} else {
			setPopover({ anchorRect: e.currentTarget.getBoundingClientRect() });
		}
	};

	return (
		<>
			{popover && (
				<PhasePopover
					anchorRect={popover.anchorRect}
					phases={phases}
					currentPhaseIndex={currentPhaseIndex}
					currentWeek={currentWeek}
					totalWeeks={totalWeeks}
					includeBasePhase={includeBasePhase ?? false}
					raceDate={raceDate}
					onClose={() => { setPopover(null); }}
				/>
			)}
			<div
				onClick={handleClick}
				className="bg-[#1d1828] text-white p-4 rounded-lg border border-[#2e293c] cursor-pointer active:bg-[#2e293c] transition-colors"
			>
				<div className="flex justify-between text-sm mb-1">
					<span className="font-bold">{phaseName}</span>
					<span className="text-[#af9ece]">
						Week {currentWeek} of {totalWeeks}
					</span>
				</div>
				<div className="w-full bg-[#2e293c] rounded-full h-2">
					<div
						className="bg-[#f23b94] h-2 rounded-full transition-all duration-500"
						style={{ width: `${progress}%` }}
					></div>
				</div>
			</div>
		</>
	);
}
