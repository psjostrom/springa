"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
	format,
	startOfMonth,
	endOfMonth,
	startOfWeek,
	endOfWeek,
	addDays,
	addMonths,
	subMonths,
	isSameMonth,
	isSameDay,
	isToday
} from "date-fns";
import { enGB } from "date-fns/locale";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { CalendarEvent, fetchCalendarData } from "@/lib/plannerLogic";
import { HRZoneBar } from "./HRZoneBar";
import { HRZoneBreakdown } from "./HRZoneBreakdown";
import { WorkoutStreamGraph } from "./WorkoutStreamGraph";
import { WorkoutStructureBar } from "./WorkoutStructureBar";
import { HRMiniChart } from "./HRMiniChart";
import "../calendar.css";

interface CalendarViewProps {
	apiKey: string;
}

type CalendarViewMode = 'month' | 'week' | 'agenda';

// Helper to extract fuel rate from description (e.g., "FUEL: 10g/10m" -> 10)
const extractFuelRate = (description: string): number | null => {
	// Try new format first: FUEL PER 10: 10g
	const newMatch = description.match(/FUEL PER 10:\s*(\d+)g/i);
	if (newMatch) return parseInt(newMatch[1]);

	// Fall back to old format for backward compatibility: FUEL: 10g/10m
	const oldMatch = description.match(/FUEL:\s*(\d+)g\/10m/i);
	return oldMatch ? parseInt(oldMatch[1]) : null;
};

const extractTotalCarbs = (description: string): number | null => {
	// Extract total carbs from new format: TOTAL: 63g
	const match = description.match(/TOTAL:\s*(\d+)g/i);
	return match ? parseInt(match[1]) : null;
};

// Helper to estimate pace from average HR (min/km)
const estimatePaceFromHR = (avgHr: number, lthr: number = 169): number => {
	const hrPercent = avgHr / lthr;

	// Zone 1 (72-80% LTHR): ~7:00-6:30 min/km
	if (hrPercent < 0.80) return 6.75;
	// Zone 2 (77-84% LTHR): ~6:30-6:00 min/km
	if (hrPercent < 0.84) return 6.15;
	// Zone 3-4 (88-94% LTHR): ~5:30-5:00 min/km
	if (hrPercent < 0.94) return 5.15;
	// Zone 5 (>94% LTHR): ~5:00-4:30 min/km
	return 4.75;
};

// Calculate total carbs for an event
const calculateTotalCarbs = (event: CalendarEvent): number | null => {
	// First, try to extract total carbs directly from description (new format)
	const totalFromDesc = extractTotalCarbs(event.description);
	if (totalFromDesc) return totalFromDesc;

	// Fall back to calculating from fuel rate and duration (backward compatibility)
	const fuelRate = extractFuelRate(event.description);
	if (!fuelRate) return null;

	let durationMinutes: number;

	if (event.duration) {
		// Use actual duration if available
		durationMinutes = event.duration / 60;
	} else if (event.distance && event.avgHr) {
		// Estimate duration from distance and HR
		const distanceKm = event.distance / 1000;
		const paceMinPerKm = estimatePaceFromHR(event.avgHr);
		durationMinutes = distanceKm * paceMinPerKm;
	} else if (event.distance) {
		// Fallback: assume 6 min/km pace
		const distanceKm = event.distance / 1000;
		durationMinutes = distanceKm * 6;
	} else {
		return null;
	}

	// Calculate total carbs: (duration / 10 minutes) * fuel rate
	return Math.round((durationMinutes / 10) * fuelRate);
};

export function CalendarView({ apiKey }: CalendarViewProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [events, setEvents] = useState<CalendarEvent[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
	const [currentMonth, setCurrentMonth] = useState(new Date());
	const [selectedWeek, setSelectedWeek] = useState(new Date());
	const [error, setError] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
	const loadedRangeRef = useRef<{ start: Date; end: Date } | null>(null);
	const agendaScrollRef = useRef<HTMLDivElement>(null);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const lastCompletedRef = useRef<HTMLDivElement>(null);
	const hasScrolledToLastCompleted = useRef(false);

	// Set responsive view mode after hydration to avoid SSR mismatch
	useEffect(() => {
		const isMobile = window.innerWidth < 768;
		setViewMode(isMobile ? 'agenda' : 'month');
	}, []);

	// Handle Escape key to close modal
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && selectedEvent) {
				setSelectedEvent(null);
			}
		};

		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [selectedEvent]);

	// Fetch data only when navigating outside loaded range
	useEffect(() => {
		if (!apiKey) return;

		const loadCalendarData = async () => {
			// Calculate needed range to cover both currentMonth and selectedWeek
			// For agenda view, load more past data (6 months back) to show workout history
			let neededStart = startOfMonth(subMonths(currentMonth, viewMode === 'agenda' ? 6 : 2));
			let neededEnd = endOfMonth(addMonths(currentMonth, 2));

			// Expand range if selectedWeek falls outside
			const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
			const weekEnd = addDays(weekStart, 6);
			if (weekStart < neededStart) {
				neededStart = startOfMonth(subMonths(weekStart, 2));
			}
			if (weekEnd > neededEnd) {
				neededEnd = endOfMonth(addMonths(weekEnd, 2));
			}

			// Check if we already have this data
			const loadedRange = loadedRangeRef.current;
			if (loadedRange &&
				loadedRange.start <= neededStart &&
				loadedRange.end >= neededEnd) {
				return; // Data already loaded, no need to fetch
			}

			setIsLoading(true);
			setError(null);
			try {
				const data = await fetchCalendarData(apiKey, neededStart, neededEnd);
				setEvents(data);
				loadedRangeRef.current = { start: neededStart, end: neededEnd };
			} catch (err) {
				console.error('Error loading calendar data:', err);
				setError('Failed to load calendar data. Please check your API key and try again.');
			} finally {
				setIsLoading(false);
			}
		};

		loadCalendarData();
	}, [apiKey, currentMonth, selectedWeek, viewMode]);

	// Sync URL params with modal state
	useEffect(() => {
		const workoutId = searchParams.get('workout');

		if (workoutId) {
			// Find the event with this ID
			const event = events.find(e => e.id === workoutId);
			if (event) {
				setSelectedEvent(event);
			}
		} else {
			// No workout param, close modal
			setSelectedEvent(null);
		}
	}, [searchParams, events]);

	// Generate calendar grid
	const calendarDays = useMemo(() => {
		const monthStart = startOfMonth(currentMonth);
		const monthEnd = endOfMonth(currentMonth);
		const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
		const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

		const days: Date[] = [];
		let day = calendarStart;
		while (day <= calendarEnd) {
			days.push(day);
			day = addDays(day, 1);
		}
		return days;
	}, [currentMonth]);

	// Get events for a specific date
	const getEventsForDate = (date: Date): CalendarEvent[] => {
		return events.filter(event => isSameDay(event.date, date));
	};

	// Open modal by updating URL
	const openWorkoutModal = (event: CalendarEvent) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set('workout', event.id);
		router.push(`?${params.toString()}`, { scroll: false });
	};

	// Close modal by removing URL param
	const closeWorkoutModal = () => {
		router.back();
	};

	// Get event style class
	const getEventStyle = (event: CalendarEvent) => {
		if (event.type === "race") return "bg-red-500 text-white";
		if (event.type === "completed") {
			if (event.category === "long") return "bg-green-600 text-white";
			if (event.category === "interval") return "bg-purple-600 text-white";
			return "bg-green-500 text-white";
		}
		// Planned
		if (event.category === "long") return "bg-green-200 text-green-800";
		if (event.category === "interval") return "bg-purple-200 text-purple-800";
		return "bg-blue-200 text-blue-800";
	};

	const getEventIcon = (event: CalendarEvent) => {
		if (event.type === "race") return "🏁";
		if (event.category === "long") return "🏃";
		if (event.category === "interval") return "⚡";
		return "✓";
	};

	const navigateMonth = (direction: 'prev' | 'next') => {
		setCurrentMonth(direction === 'prev' ? subMonths(currentMonth, 1) : addMonths(currentMonth, 1));
	};

	const navigateWeek = (direction: 'prev' | 'next') => {
		setSelectedWeek(direction === 'prev' ? addDays(selectedWeek, -7) : addDays(selectedWeek, 7));
	};

	// Generate week days
	const weekDays = useMemo(() => {
		const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 }); // Monday
		const days: Date[] = [];
		for (let i = 0; i < 7; i++) {
			days.push(addDays(weekStart, i));
		}
		return days;
	}, [selectedWeek]);

	// Get all loaded events, sorted by date for agenda view
	const agendaEvents = useMemo(() => {
		return events.sort((a, b) => a.date.getTime() - b.date.getTime());
	}, [events]);

	// Find the index of the last completed workout
	const lastCompletedIndex = useMemo(() => {
		const completedEvents = agendaEvents.filter(e => e.type === 'completed');
		if (completedEvents.length === 0) return -1;
		const lastCompleted = completedEvents[completedEvents.length - 1];
		return agendaEvents.findIndex(e => e.id === lastCompleted.id);
	}, [agendaEvents]);

	// Load more data for infinite scroll in agenda view (downward)
	const loadMoreEvents = useCallback(async () => {
		if (!apiKey || isLoadingMore || !loadedRangeRef.current) return;

		setIsLoadingMore(true);
		try {
			// Extend the range forward by 3 months
			const currentEnd = loadedRangeRef.current.end;
			const newEnd = endOfMonth(addMonths(currentEnd, 3));

			const newData = await fetchCalendarData(apiKey, addDays(currentEnd, 1), newEnd);

			// Merge new events with existing ones, avoiding duplicates
			setEvents(prev => {
				const existingIds = new Set(prev.map(e => e.id));
				const uniqueNew = newData.filter(e => !existingIds.has(e.id));
				return [...prev, ...uniqueNew];
			});

			loadedRangeRef.current = {
				start: loadedRangeRef.current.start,
				end: newEnd
			};
		} catch (err) {
			console.error('Error loading more events:', err);
		} finally {
			setIsLoadingMore(false);
		}
	}, [apiKey, isLoadingMore]);

	// Load more data for infinite scroll in agenda view (upward)
	const loadPreviousEvents = useCallback(async () => {
		if (!apiKey || isLoadingMore || !loadedRangeRef.current) return;

		setIsLoadingMore(true);
		try {
			// Extend the range backward by 3 months
			const currentStart = loadedRangeRef.current.start;
			const newStart = startOfMonth(subMonths(currentStart, 3));

			const newData = await fetchCalendarData(apiKey, newStart, addDays(currentStart, -1));

			// Merge new events with existing ones, avoiding duplicates
			setEvents(prev => {
				const existingIds = new Set(prev.map(e => e.id));
				const uniqueNew = newData.filter(e => !existingIds.has(e.id));
				return [...uniqueNew, ...prev];
			});

			loadedRangeRef.current = {
				start: newStart,
				end: loadedRangeRef.current.end
			};
		} catch (err) {
			console.error('Error loading previous events:', err);
		} finally {
			setIsLoadingMore(false);
		}
	}, [apiKey, isLoadingMore]);

	// Scroll to last completed workout on initial agenda view load
	useEffect(() => {
		if (viewMode !== 'agenda' || !lastCompletedRef.current || hasScrolledToLastCompleted.current) return;

		// Small delay to ensure DOM is fully rendered
		setTimeout(() => {
			if (lastCompletedRef.current) {
				lastCompletedRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
				hasScrolledToLastCompleted.current = true;
			}
		}, 100);
	}, [viewMode, lastCompletedIndex, events]);

	// Reset scroll flag when leaving agenda view
	useEffect(() => {
		if (viewMode !== 'agenda') {
			hasScrolledToLastCompleted.current = false;
		}
	}, [viewMode]);

	// Handle scroll event for infinite scroll in agenda view
	useEffect(() => {
		if (viewMode !== 'agenda') return;

		const handleScroll = () => {
			const container = agendaScrollRef.current;
			if (!container) return;

			// Check if user has scrolled near the bottom (within 200px)
			const scrollPosition = container.scrollTop + container.clientHeight;
			const scrollHeight = container.scrollHeight;

			if (scrollHeight - scrollPosition < 200 && !isLoadingMore) {
				loadMoreEvents();
			}

			// Check if user has scrolled near the top (within 200px)
			if (container.scrollTop < 200 && !isLoadingMore) {
				loadPreviousEvents();
			}
		};

		const container = agendaScrollRef.current;
		if (container) {
			container.addEventListener('scroll', handleScroll);
			return () => container.removeEventListener('scroll', handleScroll);
		}
	}, [viewMode, isLoadingMore, loadMoreEvents, loadPreviousEvents]);

	return (
		<div className="max-w-7xl mx-auto">
			{/* Navigation */}
			<div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-100 mb-4 sm:mb-6">
				<div className="flex items-center justify-between mb-2">
					<button
						onClick={() => viewMode === 'week' ? navigateWeek('prev') : navigateMonth('prev')}
						className="p-2 hover:bg-slate-100 rounded-lg transition"
					>
						<ChevronLeft size={20} />
					</button>
					<h2 className="text-xl sm:text-2xl font-bold">
						{viewMode === 'week' ? (
							<>
								{format(weekDays[0], "d MMM", { locale: enGB })} - {format(weekDays[6], "d MMM yyyy", { locale: enGB })}
							</>
						) : (
							format(currentMonth, "MMMM yyyy", { locale: enGB })
						)}
					</h2>
					<button
						onClick={() => viewMode === 'week' ? navigateWeek('next') : navigateMonth('next')}
						className="p-2 hover:bg-slate-100 rounded-lg transition"
					>
						<ChevronRight size={20} />
					</button>
				</div>
				<div className="flex items-center justify-center gap-2 mt-3">
					<button
						onClick={() => setViewMode('month')}
						className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
							viewMode === 'month'
								? 'bg-blue-600 text-white'
								: 'bg-slate-100 text-slate-600 hover:bg-slate-200'
						}`}
					>
						Month
					</button>
					<button
						onClick={() => setViewMode('week')}
						className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
							viewMode === 'week'
								? 'bg-blue-600 text-white'
								: 'bg-slate-100 text-slate-600 hover:bg-slate-200'
						}`}
					>
						Week
					</button>
					<button
						onClick={() => setViewMode('agenda')}
						className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
							viewMode === 'agenda'
								? 'bg-blue-600 text-white'
								: 'bg-slate-100 text-slate-600 hover:bg-slate-200'
						}`}
					>
						Agenda
					</button>
				</div>
			</div>

			{/* Calendar / Agenda */}
			<div className="bg-white p-2 sm:p-6 rounded-xl shadow-sm border border-slate-100">
				{isLoading && (
					<div className="flex items-center justify-center py-12">
						<Loader2 className="animate-spin text-slate-400" size={32} />
					</div>
				)}

				{error && (
					<div className="flex items-center justify-center py-12">
						<div className="text-center">
							<div className="text-red-600 font-semibold mb-2">⚠️ Error</div>
							<div className="text-sm text-slate-600">{error}</div>
							<button
								onClick={() => {
									setError(null);
									setCurrentMonth(new Date(currentMonth));
								}}
								className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
							>
								Retry
							</button>
						</div>
					</div>
				)}

				{!isLoading && !error && viewMode === 'month' && (
					<div className="calendar-grid">
						{/* Day headers */}
						<div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200">
							{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
								<div key={day} className="bg-slate-50 p-2 text-center text-xs sm:text-sm font-semibold text-slate-600">
									{day}
								</div>
							))}
						</div>

						{/* Calendar days grid */}
						<div className="grid grid-cols-7 gap-px bg-slate-200 border-x border-b border-slate-200 min-h-[500px]">
							{calendarDays.map((day, idx) => {
								const dayEvents = getEventsForDate(day);
								const isCurrentMonth = isSameMonth(day, currentMonth);
								const isTodayDate = isToday(day);

								return (
									<div
										key={idx}
										className={`bg-white p-1 sm:p-2 min-h-[80px] sm:min-h-[120px] overflow-hidden ${
											!isCurrentMonth ? 'opacity-40' : ''
										} ${isTodayDate ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
									>
										<div className="flex flex-col h-full">
											<div className={`text-xs sm:text-sm mb-1 ${
												isTodayDate ? 'font-bold text-blue-600' : 'text-slate-600'
											}`}>
												{format(day, 'd')}
											</div>

											<div className="flex-1 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
												{dayEvents.map((event) => (
													<button
														key={event.id}
														onClick={() => openWorkoutModal(event)}
														className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 transition ${getEventStyle(event)} w-full text-left break-words`}
													>
														<div className="flex items-center gap-0.5 mb-0.5">
															<span className="flex-shrink-0">{getEventIcon(event)}</span>
															<span className="hidden sm:inline truncate">{event.name}</span>
														</div>
														{event.type === "completed" && event.hrZones && (
															<HRMiniChart
																z1={event.hrZones.z1}
																z2={event.hrZones.z2}
																z3={event.hrZones.z3}
																z4={event.hrZones.z4}
																z5={event.hrZones.z5}
																maxHeight={20}
															/>
														)}
														{event.type === "planned" && event.description && (
															<WorkoutStructureBar
																description={event.description}
																maxHeight={20}
															/>
														)}
													</button>
												))}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{!isLoading && !error && viewMode === 'week' && (
					<div className="calendar-grid">
						{/* Day headers */}
						<div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200">
							{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
								<div key={day} className="bg-slate-50 p-2 text-center text-xs sm:text-sm font-semibold text-slate-600">
									{day}
								</div>
							))}
						</div>

						{/* Week days grid */}
						<div className="grid grid-cols-7 gap-px bg-slate-200 border-x border-b border-slate-200">
							{weekDays.map((day, idx) => {
								const dayEvents = getEventsForDate(day);
								const isTodayDate = isToday(day);

								return (
									<div
										key={idx}
										className={`bg-white p-1 sm:p-2 min-h-[200px] sm:min-h-[300px] overflow-hidden ${
											isTodayDate ? 'ring-2 ring-blue-500 ring-inset' : ''
										}`}
									>
										<div className="flex flex-col h-full">
											<div className={`text-xs sm:text-sm mb-1 ${
												isTodayDate ? 'font-bold text-blue-600' : 'text-slate-600'
											}`}>
												{format(day, 'd MMM')}
											</div>

											<div className="flex-1 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
												{dayEvents.map((event) => (
													<button
														key={event.id}
														onClick={() => openWorkoutModal(event)}
														className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 transition ${getEventStyle(event)} w-full text-left break-words`}
													>
														<div className="flex items-center gap-0.5 mb-0.5">
															<span className="flex-shrink-0">{getEventIcon(event)}</span>
															<span className="hidden sm:inline truncate">{event.name}</span>
														</div>
														{event.type === "completed" && event.hrZones && (
															<HRMiniChart
																z1={event.hrZones.z1}
																z2={event.hrZones.z2}
																z3={event.hrZones.z3}
																z4={event.hrZones.z4}
																z5={event.hrZones.z5}
																maxHeight={20}
															/>
														)}
														{event.type === "planned" && event.description && (
															<WorkoutStructureBar
																description={event.description}
																maxHeight={20}
															/>
														)}
													</button>
												))}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{!isLoading && !error && viewMode === 'agenda' && (
					<div
						ref={agendaScrollRef}
						className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto"
					>
						{agendaEvents.length === 0 ? (
							<div className="text-center py-12 text-slate-500">
								No workouts scheduled
							</div>
						) : (
							<>
							{agendaEvents.map((event, index) => {
								const isLastCompleted = index === lastCompletedIndex;
								return (
									<div
										key={event.id}
										ref={isLastCompleted ? lastCompletedRef : null}
										onClick={() => openWorkoutModal(event)}
										className="flex gap-4 p-4 hover:bg-slate-50 cursor-pointer rounded-lg transition border border-slate-100"
									>
										{/* Date */}
										<div className="flex-shrink-0 text-center w-16 sm:w-20">
											<div className="text-xs sm:text-sm text-slate-600 uppercase">
												{format(event.date, "EEE", { locale: enGB })}
											</div>
											<div className="text-2xl sm:text-3xl font-bold text-slate-900">
												{format(event.date, "d", { locale: enGB })}
											</div>
											<div className="text-xs text-slate-600">
												{format(event.date, "MMM", { locale: enGB })}
											</div>
										</div>

										{/* Event Details */}
										<div className="flex-1 min-w-0">
											<div className="flex items-start gap-2 mb-2 flex-wrap">
												<div className="flex items-center gap-2 min-w-0 flex-1">
													<span className="text-lg flex-shrink-0">{getEventIcon(event)}</span>
													<h3 className={`font-semibold truncate px-2 py-0.5 rounded text-sm border ${
														event.type === "completed"
															? "bg-green-50 text-green-700 border-green-200 sm:bg-transparent sm:text-slate-900 sm:border-transparent sm:px-0 sm:py-0"
															: event.type === "race"
																? "bg-red-50 text-red-700 border-red-200 sm:bg-transparent sm:text-slate-900 sm:border-transparent sm:px-0 sm:py-0"
																: "bg-blue-50 text-blue-700 border-blue-200 sm:bg-transparent sm:text-slate-900 sm:border-transparent sm:px-0 sm:py-0"
													}`}>
														{event.name}
													</h3>
												</div>
												<span
													className={`hidden sm:inline-block px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
														event.type === "completed"
															? "bg-green-100 text-green-700"
															: event.type === "race"
																? "bg-red-100 text-red-700"
																: "bg-blue-100 text-blue-700"
													}`}
												>
													{event.type === "completed"
														? "Completed"
														: event.type === "race"
															? "Race"
															: "Planned"}
												</span>
											</div>

											{event.type === "completed" && (
												<>
													{/* Stats Grid */}
													<div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs sm:text-sm mb-2">
														{event.distance && (
															<div className="text-slate-600">
																<span className="font-semibold text-slate-900">
																	{(event.distance / 1000).toFixed(2)} km
																</span>
															</div>
														)}
														{event.duration && (
															<div className="text-slate-600">
																<span className="font-semibold text-slate-900">
																	{Math.floor(event.duration / 60)} min
																</span>
															</div>
														)}
														{event.pace && (
															<div className="text-slate-600">
																<span className="font-semibold text-slate-900">
																	{Math.floor(event.pace)}:
																	{String(Math.round((event.pace % 1) * 60)).padStart(2, "0")}
																</span>
																{" "}
																/km
															</div>
														)}
														{event.avgHr && (
															<div className="text-slate-600">
																<span className="font-semibold text-slate-900">
																	{event.avgHr}
																</span>
																{" "}
																bpm
															</div>
														)}
														{event.load && (
															<div className="text-slate-600">
																Load:{" "}
																<span className="font-semibold text-slate-900">
																	{Math.round(event.load)}
																</span>
															</div>
														)}
														{event.intensity !== undefined && (
															<div className="text-slate-600">
																IF:{" "}
																<span className="font-semibold text-slate-900">
																	{Math.round(event.intensity)}%
																</span>
															</div>
														)}
														{event.calories && (
															<div className="text-slate-600">
																<span className="font-semibold text-slate-900">
																	{event.calories}
																</span>
																{" "}
																kcal
															</div>
														)}
														{event.cadence && (
															<div className="text-slate-600">
																<span className="font-semibold text-slate-900">
																	{Math.round(event.cadence)}
																</span>
																{" "}
																spm
															</div>
														)}
														{calculateTotalCarbs(event) && (
															<div className="text-slate-600">
																<span className="font-semibold text-slate-900">
																	{calculateTotalCarbs(event)}g
																</span>
																{" "}
																carbs
															</div>
														)}
													</div>

													{/* HR Zones */}
													{event.hrZones && (
														<div className="mt-2">
															<HRMiniChart
																z1={event.hrZones.z1}
																z2={event.hrZones.z2}
																z3={event.hrZones.z3}
																z4={event.hrZones.z4}
																z5={event.hrZones.z5}
																maxHeight={40}
															/>
														</div>
													)}
												</>
											)}

											{event.type === "planned" && event.description && (
												<>
													<div className="mb-2">
														<WorkoutStructureBar
															description={event.description}
															maxHeight={40}
														/>
													</div>
													<div className="text-sm text-slate-600 line-clamp-2">
														{event.description}
													</div>
												</>
											)}
										</div>
									</div>
								);
							})}
							{isLoadingMore && (
								<div className="flex items-center justify-center py-8">
									<Loader2 className="animate-spin text-slate-400" size={24} />
									<span className="ml-2 text-sm text-slate-500">Loading more...</span>
								</div>
							)}
							</>
						)}
					</div>
				)}
			</div>

			{/* Event Detail Modal */}
			{selectedEvent && (
				<div
					className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
					onClick={() => closeWorkoutModal()}
				>
					<div
						className="bg-white rounded-xl p-4 sm:p-6 max-w-3xl w-full shadow-xl max-h-[90vh] overflow-y-auto"
						onClick={(e: React.MouseEvent) => e.stopPropagation()}
					>
						<div className="flex items-start justify-between mb-4">
							<div>
								<div className="text-sm text-slate-600 mb-1">
									{format(selectedEvent.date, "EEEE d MMMM yyyy 'at' HH:mm", { locale: enGB })}
								</div>
								<h3 className="text-lg sm:text-xl font-bold">
									{selectedEvent.name}
								</h3>
								<div
									className={`inline-block px-2 py-1 rounded text-xs font-medium mt-2 ${getEventStyle(selectedEvent)}`}
								>
									{selectedEvent.type === "completed"
										? "✓ Completed"
										: selectedEvent.type === "race"
											? "🏁 Race"
											: "📅 Planned"}
								</div>
							</div>
							<button
								onClick={() => closeWorkoutModal()}
								className="text-slate-400 hover:text-slate-600 text-xl"
							>
								✕
							</button>
						</div>

						{selectedEvent.description && (
							<div className="bg-slate-50 rounded-lg p-3 sm:p-4 mb-4">
								<div className="text-sm whitespace-pre-wrap">
									{selectedEvent.description}
								</div>
							</div>
						)}

						{selectedEvent.type === "planned" && calculateTotalCarbs(selectedEvent) && (
							<div className="mb-4">
								<div className="text-sm text-slate-600 mb-1">Estimated Carbs</div>
								<div className="text-lg font-semibold text-slate-900">
									{calculateTotalCarbs(selectedEvent)}g
								</div>
							</div>
						)}

						{selectedEvent.type === "completed" && (
							<>
								<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 text-sm mb-4">
									{selectedEvent.distance && (
										<div>
											<div className="text-slate-600">Distance</div>
											<div className="font-semibold">
												{(selectedEvent.distance / 1000).toFixed(2)} km
											</div>
										</div>
									)}
									{selectedEvent.duration && (
										<div>
											<div className="text-slate-600">Duration</div>
											<div className="font-semibold">
												{Math.floor(selectedEvent.duration / 60)} min
											</div>
										</div>
									)}
									{selectedEvent.pace && (
										<div>
											<div className="text-slate-600">Pace</div>
											<div className="font-semibold">
												{Math.floor(selectedEvent.pace)}:
												{String(
													Math.round((selectedEvent.pace % 1) * 60),
												).padStart(2, "0")}
												/km
											</div>
										</div>
									)}
									{selectedEvent.calories && (
										<div>
											<div className="text-slate-600">Calories</div>
											<div className="font-semibold">{selectedEvent.calories} kcal</div>
										</div>
									)}
									{selectedEvent.cadence && (
										<div>
											<div className="text-slate-600">Cadence</div>
											<div className="font-semibold">{Math.round(selectedEvent.cadence)} spm</div>
										</div>
									)}
									{calculateTotalCarbs(selectedEvent) && (
										<div>
											<div className="text-slate-600">Carbs</div>
											<div className="font-semibold">{calculateTotalCarbs(selectedEvent)}g</div>
										</div>
									)}
									{selectedEvent.avgHr && (
										<div>
											<div className="text-slate-600">Avg HR</div>
											<div className="font-semibold">{selectedEvent.avgHr} bpm</div>
										</div>
									)}
									{selectedEvent.maxHr && (
										<div>
											<div className="text-slate-600">Max HR</div>
											<div className="font-semibold">{selectedEvent.maxHr} bpm</div>
										</div>
									)}
									{selectedEvent.load && (
										<div>
											<div className="text-slate-600">Load</div>
											<div className="font-semibold">
												{Math.round(selectedEvent.load)}
											</div>
										</div>
									)}
									{selectedEvent.intensity !== undefined && (
										<div>
											<div className="text-slate-600">Intensity</div>
											<div className="font-semibold">
												{Math.round(selectedEvent.intensity)}%
											</div>
										</div>
									)}
								</div>

								{selectedEvent.hrZones && (
									<div className="mb-4">
										<div className="text-sm font-semibold text-slate-700 mb-3">
											Heart Rate Zones
										</div>
										<HRZoneBreakdown
											z1={selectedEvent.hrZones.z1}
											z2={selectedEvent.hrZones.z2}
											z3={selectedEvent.hrZones.z3}
											z4={selectedEvent.hrZones.z4}
											z5={selectedEvent.hrZones.z5}
										/>
									</div>
								)}

								{selectedEvent.streamData && Object.keys(selectedEvent.streamData).length > 0 ? (
									<div className="mb-4">
										<WorkoutStreamGraph streamData={selectedEvent.streamData} />
									</div>
								) : selectedEvent.type === "completed" ? (
									<div className="text-sm text-slate-500 italic mt-4">
										💡 Detailed workout data (graphs) not available for this activity
									</div>
								) : null}
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
