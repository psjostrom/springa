"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useModalURL } from "../hooks/useModalURL";
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
import type { CalendarEvent, PaceTable } from "@/lib/types";
import type { BGResponseModel } from "@/lib/bgModel";
import type { RunBGContext } from "@/lib/runBGContext";
import { fetchActivityDetails, deleteEvent, deleteActivity } from "@/lib/intervalsApi";
import { parseEventId } from "@/lib/format";
import { EventModal } from "./EventModal";
import { DayCell } from "./DayCell";
import { AgendaView } from "./AgendaView";
import { useDragDrop } from "../hooks/useDragDrop";
import { ErrorCard } from "./ErrorCard";
import "../calendar.css";

interface CalendarViewProps {
  apiKey: string;
  initialEvents: CalendarEvent[];
  isLoadingInitial: boolean;
  initialError: string | null;
  onRetryLoad?: () => void;
  runBGContexts?: Map<string, RunBGContext>;
  paceTable?: PaceTable;
  bgModel?: BGResponseModel | null;
}

type CalendarViewMode = "month" | "week" | "agenda";

export function CalendarView({ apiKey, initialEvents, isLoadingInitial, initialError, onRetryLoad, runBGContexts, paceTable, bgModel }: CalendarViewProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedWeek, setSelectedWeek] = useState(new Date());

  // Lazy init: detect mobile viewport without a post-mount effect
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "agenda" : "month"
  );

  // Modal URL state — reads/writes ?workout= param with proper history handling
  const modal = useModalURL("workout");
  const selectedEventId = modal.value;

  // Derive selectedEvent from events + selectedEventId (replaces enrichment effect)
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return events.find((e) => e.id === selectedEventId) ?? null;
  }, [events, selectedEventId]);

  // Sync local state when shared events change (setState during render — React-approved pattern)
  const [prevInitial, setPrevInitial] = useState(initialEvents);
  if (initialEvents !== prevInitial && initialEvents.length > 0) {
    setPrevInitial(initialEvents);
    setEvents(initialEvents);
  }

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

  // Derive loading state: completed event without stream data that hasn't failed
  const fetchedStreamIdsRef = useRef(new Set<string>());
  const [streamFetchDone, setStreamFetchDone] = useState(new Set<string>());
  const isLoadingStreamData =
    selectedEvent?.type === "completed" &&
    !selectedEvent.streamData &&
    !streamFetchDone.has(selectedEvent.id);

  // Lazy-load stream data when modal opens for a completed workout
  useEffect(() => {
    if (!selectedEventId || !apiKey) return;
    if (fetchedStreamIdsRef.current.has(selectedEventId)) return;

    const event = events.find((e) => e.id === selectedEventId);
    if (event?.type !== "completed" || event.streamData) return;

    const activityId = selectedEventId.replace("activity-", "");
    if (!activityId) return;

    fetchedStreamIdsRef.current.add(selectedEventId);
    let cancelled = false;

    fetchActivityDetails(activityId, apiKey)
      .then((details) => {
        if (cancelled) return;
        setEvents((prevEvents) =>
          prevEvents.map((e) =>
            e.id === selectedEventId
              ? {
                  ...e,
                  streamData: details.streamData,
                  avgHr: details.avgHr ?? e.avgHr,
                  maxHr: details.maxHr ?? e.maxHr,
                }
              : e,
          ),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) console.error("Error loading stream data:", err);
      })
      .finally(() => {
        if (!cancelled) setStreamFetchDone((prev) => new Set([...prev, selectedEventId]));
      });

    return () => { cancelled = true; };
  }, [selectedEventId, events, apiKey]);

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

  const openWorkoutModal = (event: CalendarEvent) => { modal.open(event.id); };
  const closeWorkoutModal = modal.close;

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedEventId) {
        closeWorkoutModal();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => { window.removeEventListener("keydown", handleEscape); };
  }, [selectedEventId, closeWorkoutModal]);

  // Handle date save from modal
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
    (_e: React.DragEvent, day: Date) => { void handleDrop(day); },
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
      <div className="bg-[#1e1535] p-2 sm:p-6 rounded-xl shadow-sm border border-[#3d2b5a] mb-1.5 sm:mb-6">
        {viewMode !== "agenda" && (
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => {
                if (viewMode === "week") { navigateWeek("prev"); } else { navigateMonth("prev"); }
              }}
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
              onClick={() => {
                if (viewMode === "week") { navigateWeek("next"); } else { navigateMonth("next"); }
              }}
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
              onClick={() => { setViewMode(mode); }}
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
        {isLoadingInitial && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-[#ff2d95]" size={32} />
          </div>
        )}

        {initialError && (
          <div className="flex items-center justify-center py-12">
            <ErrorCard message={initialError} onRetry={onRetryLoad ?? (() => undefined)} />
          </div>
        )}

        {dragError && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-[#3d1525] text-[#ff6b8a] text-sm flex items-center justify-between">
            <span>{dragError}</span>
            <button onClick={clearDragError} className="text-[#ff6b8a] hover:text-white ml-2">✕</button>
          </div>
        )}

        {!isLoadingInitial && !initialError && viewMode === "month" && (
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

        {!isLoadingInitial && !initialError && viewMode === "week" && (
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

        {!isLoadingInitial && !initialError && viewMode === "agenda" && (
          <div
            className="flex-1 overflow-y-auto"
          >
            <AgendaView
              events={agendaEvents}
              onSelectEvent={openWorkoutModal}
              paceTable={paceTable}
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
          runBGContexts={runBGContexts}
          paceTable={paceTable}
          bgModel={bgModel}
        />
      )}
    </div>
  );
}
