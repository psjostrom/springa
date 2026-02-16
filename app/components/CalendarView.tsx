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
  isToday,
} from "date-fns";
import { enGB } from "date-fns/locale";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";
import { FALLBACK_PACE_TABLE } from "@/lib/constants";
import { buildEasyPaceFromHistory } from "@/lib/utils";
import { getEventStyle, getEventIcon } from "@/lib/eventStyles";
import { fetchCalendarData, fetchActivityDetails } from "@/lib/intervalsApi";
import { HRMiniChart } from "./HRMiniChart";
import { WorkoutStructureBar } from "./WorkoutStructureBar";
import { EventModal } from "./EventModal";
import { AgendaView } from "./AgendaView";
import { useDragDrop } from "../hooks/useDragDrop";
import "../calendar.css";

interface CalendarViewProps {
  apiKey: string;
}

type CalendarViewMode = "month" | "week" | "agenda";

export function CalendarView({ apiKey }: CalendarViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const loadedRangeRef = useRef<{ start: Date; end: Date } | null>(null);
  const agendaScrollRef = useRef<HTMLDivElement>(null);
  const nextUpcomingRef = useRef<HTMLDivElement>(null);
  const hasScrolledToUpcoming = useRef(false);
  const [isLoadingStreamData, setIsLoadingStreamData] = useState(false);

  const {
    draggedEvent,
    dragOverDate,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  } = useDragDrop(apiKey, setEvents);

  // Set responsive view mode after hydration to avoid SSR mismatch
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    setViewMode(isMobile ? "agenda" : "month");
  }, []);

  // Fetch data once on mount - load full workout history
  useEffect(() => {
    if (!apiKey) return;
    if (loadedRangeRef.current) return;

    const loadCalendarData = async () => {
      const neededStart = startOfMonth(subMonths(new Date(), 24));
      const neededEnd = endOfMonth(addMonths(new Date(), 6));

      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchCalendarData(apiKey, neededStart, neededEnd);
        setEvents(data);
        loadedRangeRef.current = { start: neededStart, end: neededEnd };
      } catch (err) {
        console.error("Error loading calendar data:", err);
        setError(
          "Failed to load calendar data. Please check your API key and try again.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadCalendarData();
  }, [apiKey]);

  // Sync URL params with modal state
  useEffect(() => {
    const workoutId = searchParams.get("workout");

    if (workoutId) {
      const event = events.find((e) => e.id === workoutId);
      if (event) {
        setSelectedEvent(event);
      }
    } else {
      setSelectedEvent(null);
    }
  }, [searchParams, events]);

  // Lazy-load stream data when modal opens for a completed workout
  useEffect(() => {
    if (!selectedEvent || selectedEvent.type !== "completed") return;
    if (selectedEvent.streamData) return;
    if (!apiKey) return;

    const activityId = selectedEvent.id.replace("activity-", "");
    if (!activityId) return;

    let cancelled = false;
    setIsLoadingStreamData(true);

    fetchActivityDetails(activityId, apiKey)
      .then((details) => {
        if (cancelled) return;
        setSelectedEvent((prev) => {
          if (!prev || prev.id !== selectedEvent.id) return prev;
          return {
            ...prev,
            hrZones: details.hrZones,
            streamData: details.streamData,
            avgHr: details.avgHr || prev.avgHr,
            maxHr: details.maxHr || prev.maxHr,
          };
        });
        setEvents((prevEvents) =>
          prevEvents.map((e) =>
            e.id === selectedEvent.id
              ? {
                  ...e,
                  hrZones: details.hrZones,
                  streamData: details.streamData,
                  avgHr: details.avgHr || e.avgHr,
                  maxHr: details.maxHr || e.maxHr,
                }
              : e,
          ),
        );
      })
      .catch((err) => {
        if (!cancelled) console.error("Error loading stream data:", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStreamData(false);
      });

    return () => { cancelled = true; };
  }, [selectedEvent, apiKey]);

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
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
  const getEventsForDate = useCallback((date: Date): CalendarEvent[] => {
    return events.filter((event) => isSameDay(event.date, date));
  }, [events]);

  // Track whether we pushed a modal entry onto the history stack
  const modalPushedRef = useRef(false);

  // Open modal by updating URL
  const openWorkoutModal = (event: CalendarEvent) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("workout", event.id);
    const url = `?${params.toString()}`;

    if (searchParams.get("workout")) {
      router.replace(url, { scroll: false });
    } else {
      router.push(url, { scroll: false });
      modalPushedRef.current = true;
    }
  };

  // Close modal by removing URL param
  const closeWorkoutModal = useCallback(() => {
    if (modalPushedRef.current) {
      modalPushedRef.current = false;
      router.back();
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("workout");
      const query = params.toString();
      router.replace(query ? `?${query}` : window.location.pathname, { scroll: false });
    }
  }, [router, searchParams]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedEvent) {
        closeWorkoutModal();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedEvent, closeWorkoutModal]);

  // Handle date save from modal
  const handleDateSaved = (eventId: string, newDate: Date) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, date: newDate } : e)),
    );
    setSelectedEvent((prev) =>
      prev ? { ...prev, date: newDate } : prev,
    );
  };

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentMonth(
      direction === "prev"
        ? subMonths(currentMonth, 1)
        : addMonths(currentMonth, 1),
    );
  };

  const navigateWeek = (direction: "prev" | "next") => {
    setSelectedWeek(
      direction === "prev"
        ? addDays(selectedWeek, -7)
        : addDays(selectedWeek, 7),
    );
  };

  // Generate week days
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
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

  // Hybrid pace table: easy pace from historical data, higher zones from LT calculations
  const paceTable = useMemo(() => {
    const easyPace = buildEasyPaceFromHistory(events);
    if (!easyPace) return FALLBACK_PACE_TABLE;
    return { ...FALLBACK_PACE_TABLE, easy: easyPace };
  }, [events]);

  // Scroll to next upcoming workout on initial agenda view load
  useEffect(() => {
    if (
      viewMode !== "agenda" ||
      !nextUpcomingRef.current ||
      hasScrolledToUpcoming.current
    )
      return;

    setTimeout(() => {
      if (nextUpcomingRef.current) {
        nextUpcomingRef.current.scrollIntoView({
          behavior: "instant",
          block: "start",
        });
        hasScrolledToUpcoming.current = true;
      }
    }, 100);
  }, [viewMode, agendaEvents]);

  // Reset scroll flag when leaving agenda view
  useEffect(() => {
    if (viewMode !== "agenda") {
      hasScrolledToUpcoming.current = false;
    }
  }, [viewMode]);

  // Render a day cell for month/week views
  const renderDayCell = (day: Date, idx: number, minHeight: string, showMonthOpacity: boolean) => {
    const dayEvents = getEventsForDate(day);
    const isTodayDate = isToday(day);
    const dateKey = format(day, "yyyy-MM-dd");
    const isDropTarget = dragOverDate === dateKey;
    const isCurrentMonth = showMonthOpacity ? isSameMonth(day, currentMonth) : true;

    return (
      <div
        key={idx}
        onDragOver={handleDragOver}
        onDragEnter={() => handleDragEnter(dateKey)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => { e.preventDefault(); handleDrop(day); }}
        className={`bg-white p-1 sm:p-2 ${minHeight} overflow-hidden transition-colors ${
          !isCurrentMonth ? "opacity-40" : ""
        } ${isTodayDate && !isDropTarget ? "ring-2 ring-blue-500 ring-inset" : ""} ${
          isDropTarget ? "ring-2 ring-blue-400 ring-inset bg-blue-50" : ""
        }`}
      >
        <div className="flex flex-col h-full">
          <div
            className={`text-xs sm:text-sm mb-1 ${
              isTodayDate ? "font-bold text-blue-600" : "text-slate-600"
            }`}
          >
            {showMonthOpacity ? format(day, "d") : format(day, "d MMM")}
          </div>

          <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
            {dayEvents.map((event) => (
              <button
                key={event.id}
                draggable={event.type === "planned"}
                onDragStart={(e) => handleDragStart(e, event)}
                onDragEnd={handleDragEnd}
                onClick={() => openWorkoutModal(event)}
                className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 transition ${getEventStyle(event)} text-left w-full ${
                  draggedEvent?.id === event.id ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-0.5 mb-0.5">
                  <span className="flex-shrink-0">{getEventIcon(event)}</span>
                  <span className="hidden sm:inline break-words">{event.name}</span>
                </div>
                {event.type === "completed" && event.hrZones && (
                  <HRMiniChart
                    z1={event.hrZones.z1}
                    z2={event.hrZones.z2}
                    z3={event.hrZones.z3}
                    z4={event.hrZones.z4}
                    z5={event.hrZones.z5}
                    maxHeight={20}
                    hrData={event.streamData?.heartrate}
                  />
                )}
                {event.type === "planned" && event.description && (
                  <WorkoutStructureBar description={event.description} maxHeight={20} />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto flex-1 flex flex-col min-h-0 w-full overflow-y-auto">
      {/* Navigation */}
      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-100 mb-4 sm:mb-6">
        {viewMode !== "agenda" && (
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() =>
                viewMode === "week" ? navigateWeek("prev") : navigateMonth("prev")
              }
              className="p-2 hover:bg-slate-100 rounded-lg transition"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-xl sm:text-2xl font-bold">
              {viewMode === "week" ? (
                <>
                  {format(weekDays[0], "d MMM", { locale: enGB })} -{" "}
                  {format(weekDays[6], "d MMM yyyy", { locale: enGB })}
                </>
              ) : (
                format(currentMonth, "MMMM yyyy", { locale: enGB })
              )}
            </h2>
            <button
              onClick={() =>
                viewMode === "week" ? navigateWeek("next") : navigateMonth("next")
              }
              className="p-2 hover:bg-slate-100 rounded-lg transition"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
        <div className={`flex items-center justify-center gap-2 ${viewMode !== "agenda" ? "mt-3" : ""}`}>
          {(["month", "week", "agenda"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                viewMode === mode
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
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

        {!isLoading && !error && viewMode === "month" && (
          <div className="calendar-grid">
            <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div
                  key={day}
                  className="bg-slate-50 p-2 text-center text-xs sm:text-sm font-semibold text-slate-600"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-slate-200 border-x border-b border-slate-200 min-h-[500px]">
              {calendarDays.map((day, idx) =>
                renderDayCell(day, idx, "min-h-[80px] sm:min-h-[120px]", true)
              )}
            </div>
          </div>
        )}

        {!isLoading && !error && viewMode === "week" && (
          <div className="calendar-grid">
            <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div
                  key={day}
                  className="bg-slate-50 p-2 text-center text-xs sm:text-sm font-semibold text-slate-600"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-slate-200 border-x border-b border-slate-200">
              {weekDays.map((day, idx) =>
                renderDayCell(day, idx, "min-h-[200px] sm:min-h-[300px]", false)
              )}
            </div>
          </div>
        )}

        {!isLoading && !error && viewMode === "agenda" && (
          <div
            ref={agendaScrollRef}
            className="space-y-2 flex-1 overflow-y-auto"
          >
            <AgendaView
              events={agendaEvents}
              onSelectEvent={openWorkoutModal}
              paceTable={paceTable}
              nextUpcomingRef={nextUpcomingRef}
            />
          </div>
        )}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={closeWorkoutModal}
          onDateSaved={handleDateSaved}
          paceTable={paceTable}
          isLoadingStreamData={isLoadingStreamData}
          apiKey={apiKey}
        />
      )}
    </div>
  );
}
