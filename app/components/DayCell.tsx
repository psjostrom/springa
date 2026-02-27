import React from "react";
import { format, isSameMonth, isToday } from "date-fns";
import type { CalendarEvent } from "@/lib/types";
import { getEventStyle, getEventIcon } from "@/lib/eventStyles";
import { HRMiniChart } from "./HRMiniChart";
import { WorkoutStructureBar } from "./WorkoutStructureBar";

interface DayCellProps {
  day: Date;
  dayEvents: CalendarEvent[];
  minHeight: string;
  showMonthOpacity: boolean;
  currentMonth: Date;
  dragOverDate: string | null;
  draggedEventId: string | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (dateKey: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, day: Date) => void;
  onDragStart: (e: React.DragEvent, event: CalendarEvent) => void;
  onDragEnd: () => void;
  onEventClick: (event: CalendarEvent) => void;
}

export const DayCell = React.memo(function DayCell({
  day,
  dayEvents,
  minHeight,
  showMonthOpacity,
  currentMonth,
  dragOverDate,
  draggedEventId,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
  onEventClick,
}: DayCellProps) {
  const isTodayDate = isToday(day);
  const dateKey = format(day, "yyyy-MM-dd");
  const isDropTarget = dragOverDate === dateKey;
  const isCurrentMonth = showMonthOpacity ? isSameMonth(day, currentMonth) : true;

  return (
    <div
      onDragOver={onDragOver}
      onDragEnter={() => { onDragEnter(dateKey); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(e, day); }}
      className={`bg-[#1e1535] p-1 sm:p-2 ${minHeight} overflow-hidden transition-colors ${
        !isCurrentMonth ? "opacity-40" : ""
      } ${isTodayDate && !isDropTarget ? "ring-2 ring-[#00ffff] ring-inset" : ""} ${
        isDropTarget ? "ring-2 ring-[#ff2d95] ring-inset bg-[#2a1f3d]" : ""
      }`}
    >
      <div className="flex flex-col h-full">
        <div
          className={`text-sm mb-1 ${
            isTodayDate ? "font-bold text-[#00ffff]" : "text-[#b8a5d4]"
          }`}
        >
          {showMonthOpacity ? format(day, "d") : format(day, "d MMM")}
        </div>

        <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
          {dayEvents.map((event) => (
            <button
              key={event.id}
              draggable={event.type === "planned"}
              onDragStart={(e) => { onDragStart(e, event); }}
              onDragEnd={onDragEnd}
              onClick={() => { onEventClick(event); }}
              className={`text-sm p-1 rounded cursor-pointer hover:opacity-80 transition ${getEventStyle(event)} text-left w-full ${
                draggedEventId === event.id ? "opacity-50" : ""
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
});
