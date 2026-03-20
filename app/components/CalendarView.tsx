"use client";

import { useState, useEffect, useMemo } from "react";
import { useAtomValue } from "jotai";
import { readingsAtom } from "../atoms";
import { useModalURL } from "../hooks/useModalURL";
import { useActivityStream } from "../hooks/useActivityStream";
import { mergeStreamData } from "@/lib/enrichEvents";
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
import { deleteEvent, deleteActivity } from "@/lib/intervalsApi";
import { parseEventId } from "@/lib/format";
import { EventModal } from "./EventModal";
import { DayCell } from "./DayCell";
import { AgendaView } from "./AgendaView";
import { useDragDrop } from "../hooks/useDragDrop";
import { useWeather } from "../hooks/useWeather";
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
  hrZones?: number[];
  lthr?: number;
  warmthPreference?: number;
}

type CalendarViewMode = "month" | "week" | "agenda";

export function CalendarView({ apiKey, initialEvents, isLoadingInitial, initialError, onRetryLoad, runBGContexts, paceTable, bgModel, hrZones, lthr, warmthPreference }: CalendarViewProps) {
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
  const selectedEvent = selectedEventId
    ? events.find((e) => e.id === selectedEventId) ?? null
    : null;

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

  // Lazy-load stream data via SWR when modal opens for a completed workout
  const selectedActivityId = selectedEvent?.type === "completed" ? selectedEvent.activityId : null;
  const { data: streamData, isLoading: isLoadingStreamData } = useActivityStream(selectedActivityId ?? null, apiKey);
  const bgReadings = useAtomValue(readingsAtom);

  // Combine event + fresh stream data for modal (join at render time, not merged into state)
  const enrichedSelectedEvent = useMemo(
    () => selectedEvent && streamData ? mergeStreamData(selectedEvent, streamData, bgReadings) : selectedEvent,
    [selectedEvent, streamData, bgReadings],
  );

  // Generate calendar grid
  const calendarDays = (() => {
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
  })();

  // Get events for a specific date
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    return events.filter((event) => isSameDay(event.date, date));
  };

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
  const handleDeleteEvent = async (eventId: string) => {
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
  const weekDays = (() => {
    const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i));
    }
    return days;
  })();

  // Get all loaded events, sorted by date for agenda view
  const agendaEvents = [...events].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Weather-based clothing recommendations for upcoming planned events
  const clothingMap = useWeather(agendaEvents, warmthPreference);

  // Stable drop handler that prevents default then delegates
  const handleDropEvent = (_e: React.DragEvent, day: Date) => { void handleDrop(day); };

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
      hrZones={hrZones}
      lthr={lthr}
      onEventClick={openWorkoutModal}
    />
  );

  return (
    <div className="max-w-7xl mx-auto flex-1 flex flex-col min-h-0 w-full overflow-y-auto">
      {/* Navigation */}
      <div className="bg-surface p-2 sm:p-6 rounded-xl shadow-sm border border-border mb-1.5 sm:mb-6">
        {viewMode !== "agenda" && (
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => {
                if (viewMode === "week") { navigateWeek("prev"); } else { navigateMonth("prev"); }
              }}
              className="p-2 hover:bg-surface-alt rounded-lg transition text-muted"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-xl sm:text-2xl font-bold text-text">
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
              className="p-2 hover:bg-surface-alt rounded-lg transition text-muted"
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
                  ? "bg-brand text-white shadow-lg shadow-brand/20"
                  : "bg-surface-alt text-muted hover:bg-border-subtle hover:text-text"
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar / Agenda */}
      <div className="bg-surface p-2 sm:p-6 rounded-xl shadow-sm border border-border">
        {isLoadingInitial && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-brand" size={32} />
          </div>
        )}

        {initialError && (
          <div className="flex items-center justify-center py-12">
            <ErrorCard message={initialError} onRetry={onRetryLoad ?? (() => undefined)} />
          </div>
        )}

        {dragError && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-tint-error text-text text-sm flex items-center justify-between">
            <span>{dragError}</span>
            <button onClick={clearDragError} className="text-muted hover:text-text ml-2">✕</button>
          </div>
        )}

        {!isLoadingInitial && !initialError && viewMode === "month" && (
          <div className="calendar-grid">
            <div className="grid grid-cols-7 gap-px bg-border border border-border">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div
                  key={day}
                  className="bg-surface-alt p-2 text-center text-sm font-semibold text-muted"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-border border-x border-b border-border min-h-[500px]">
              {calendarDays.map((day, idx) =>
                renderDayCell(day, idx, "min-h-[80px] sm:min-h-[120px]", true)
              )}
            </div>
          </div>
        )}

        {!isLoadingInitial && !initialError && viewMode === "week" && (
          <div className="calendar-grid">
            <div className="grid grid-cols-7 gap-px bg-border border border-border">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div
                  key={day}
                  className="bg-surface-alt p-2 text-center text-sm font-semibold text-muted"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-border border-x border-b border-border">
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
              hrZones={hrZones}
              lthr={lthr}
              clothingMap={clothingMap}
            />
          </div>
        )}
      </div>

      {/* Event Detail Modal */}
      {enrichedSelectedEvent && (
        <EventModal
          event={enrichedSelectedEvent}
          onClose={closeWorkoutModal}
          onDateSaved={handleDateSaved}
          onDelete={handleDeleteEvent}
          isLoadingStreamData={isLoadingStreamData}
          apiKey={apiKey}
          runBGContexts={runBGContexts}
          paceTable={paceTable}
          bgModel={bgModel}
          hrZones={hrZones}
          lthr={lthr}
          clothing={clothingMap.get(enrichedSelectedEvent.id)}
        />
      )}
    </div>
  );
}
