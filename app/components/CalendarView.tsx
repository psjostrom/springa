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
  isSameDay,
} from "date-fns";
import { enGB } from "date-fns/locale";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";
import { fetchCalendarData, fetchActivityDetails, deleteEvent, deleteActivity } from "@/lib/intervalsApi";
import { parseEventId } from "@/lib/utils";
import { EventModal } from "./EventModal";
import { DayCell } from "./DayCell";
import { AgendaView } from "./AgendaView";
import { useDragDrop } from "../hooks/useDragDrop";
import { ErrorCard } from "./ErrorCard";
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
  const [isLoadingStreamData, setIsLoadingStreamData] = useState(false);

  const {
    draggedEvent,
    dragOverDate,
    dragError,
    clearDragError,
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
        setSelectedEvent((prev) => {
          // Same event already showing — only update if data was enriched
          if (prev?.id === event.id) {
            if (event.streamData && !prev.streamData) return event;
            if (event.hrZones && !prev.hrZones) return event;
            return prev;
          }
          return event;
        });
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
        // Only update events — the URL sync effect derives selectedEvent
        // from events, so it will pick up the enriched data automatically.
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

  // Open modal by updating URL — set selectedEvent immediately so the
  // modal appears without waiting for the URL roundtrip.
  const openWorkoutModal = (event: CalendarEvent) => {
    setSelectedEvent(event);

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

  // Handle date save from modal — URL sync effect derives selectedEvent
  const handleDateSaved = (eventId: string, newDate: Date) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, date: newDate } : e)),
    );
  };

  // Handle delete from modal (planned events or completed activities)
  const handleDeleteEvent = useCallback(async (eventId: string) => {
    if (eventId.startsWith("activity-")) {
      const activityId = eventId.replace("activity-", "");
      await deleteActivity(apiKey, activityId);
    } else {
      const numericId = parseEventId(eventId);
      if (isNaN(numericId)) return;
      await deleteEvent(apiKey, numericId);
    }
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    closeWorkoutModal();
  }, [apiKey, closeWorkoutModal]);

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
    return [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [events]);

  // Stable drop handler that prevents default then delegates
  const handleDropEvent = useCallback(
    (_e: React.DragEvent, day: Date) => { handleDrop(day); },
    [handleDrop],
  );

  const renderDayCell = (day: Date, idx: number, minHeight: string, showMonthOpacity: boolean) => (
    <DayCell
      key={idx}
      day={day}
      dayEvents={getEventsForDate(day)}
      minHeight={minHeight}
      showMonthOpacity={showMonthOpacity}
      currentMonth={currentMonth}
      dragOverDate={dragOverDate}
      draggedEventId={draggedEvent?.id ?? null}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDropEvent}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onEventClick={openWorkoutModal}
    />
  );

  return (
    <div className="max-w-7xl mx-auto flex-1 flex flex-col min-h-0 w-full overflow-y-auto">
      {/* Navigation */}
      <div className="bg-[#1e1535] p-4 sm:p-6 rounded-xl shadow-sm border border-[#3d2b5a] mb-4 sm:mb-6">
        {viewMode !== "agenda" && (
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() =>
                viewMode === "week" ? navigateWeek("prev") : navigateMonth("prev")
              }
              className="p-2 hover:bg-[#2a1f3d] rounded-lg transition text-[#c4b5fd]"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
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
              className="p-2 hover:bg-[#2a1f3d] rounded-lg transition text-[#c4b5fd]"
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
                  ? "bg-[#ff2d95] text-white shadow-lg shadow-[#ff2d95]/20"
                  : "bg-[#2a1f3d] text-[#b8a5d4] hover:bg-[#3d2b5a] hover:text-[#c4b5fd]"
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar / Agenda */}
      <div className="bg-[#1e1535] p-2 sm:p-6 rounded-xl shadow-sm border border-[#3d2b5a]">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-[#ff2d95]" size={32} />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-12">
            <ErrorCard message={error} onRetry={() => {
              setError(null);
              setCurrentMonth(new Date(currentMonth));
            }} />
          </div>
        )}

        {dragError && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-[#3d1525] text-[#ff6b8a] text-sm flex items-center justify-between">
            <span>{dragError}</span>
            <button onClick={clearDragError} className="text-[#ff6b8a] hover:text-white ml-2">✕</button>
          </div>
        )}

        {!isLoading && !error && viewMode === "month" && (
          <div className="calendar-grid">
            <div className="grid grid-cols-7 gap-px bg-[#3d2b5a] border border-[#3d2b5a]">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div
                  key={day}
                  className="bg-[#2a1f3d] p-2 text-center text-sm font-semibold text-[#b8a5d4]"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-[#3d2b5a] border-x border-b border-[#3d2b5a] min-h-[500px]">
              {calendarDays.map((day, idx) =>
                renderDayCell(day, idx, "min-h-[80px] sm:min-h-[120px]", true)
              )}
            </div>
          </div>
        )}

        {!isLoading && !error && viewMode === "week" && (
          <div className="calendar-grid">
            <div className="grid grid-cols-7 gap-px bg-[#3d2b5a] border border-[#3d2b5a]">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div
                  key={day}
                  className="bg-[#2a1f3d] p-2 text-center text-sm font-semibold text-[#b8a5d4]"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-[#3d2b5a] border-x border-b border-[#3d2b5a]">
              {weekDays.map((day, idx) =>
                renderDayCell(day, idx, "min-h-[200px] sm:min-h-[300px]", false)
              )}
            </div>
          </div>
        )}

        {!isLoading && !error && viewMode === "agenda" && (
          <div
            className="flex-1 overflow-y-auto"
          >
            <AgendaView
              events={agendaEvents}
              onSelectEvent={openWorkoutModal}
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
          onDelete={handleDeleteEvent}
          isLoadingStreamData={isLoadingStreamData}
          apiKey={apiKey}
        />
      )}
    </div>
  );
}
