import { useState } from "react";
import { format } from "date-fns";
import type { CalendarEvent } from "@/lib/types";
import { updateEvent } from "@/lib/intervalsClient";
import { syncToGoogleCalendar } from "@/lib/googleCalendar";
import { parseEventId } from "@/lib/format";

export function useDragDrop(
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>,
) {
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, event: CalendarEvent) => {
    if (event.type !== "planned") return;
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", event.id);
  };

  const handleDragEnd = () => {
    setDraggedEvent(null);
    setDragOverDate(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!draggedEvent) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (dateKey: string) => {
    if (!draggedEvent) return;
    setDragOverDate(dateKey);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!draggedEvent) return;
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && (e.currentTarget as HTMLElement).contains(relatedTarget)) return;
    setDragOverDate(null);
  };

  const handleDrop = async (targetDate: Date) => {
    if (!draggedEvent) return;

    const numericId = parseEventId(draggedEvent.id);
    if (isNaN(numericId)) {
      setDraggedEvent(null);
      setDragOverDate(null);
      return;
    }

    const originalDate = draggedEvent.date;
    const newDate = new Date(targetDate);
    newDate.setHours(originalDate.getHours(), originalDate.getMinutes(), originalDate.getSeconds());

    const newDateLocal = format(newDate, "yyyy-MM-dd'T'HH:mm:ss");

    setDragError(null);
    try {
      await updateEvent(numericId, { start_date_local: newDateLocal });

      // Best-effort Google Calendar sync
      void syncToGoogleCalendar("update", {
        eventName: draggedEvent.name,
        eventDate: format(draggedEvent.date, "yyyy-MM-dd"),
        event: {
          name: draggedEvent.name,
          description: draggedEvent.description,
          startLocal: newDateLocal,
          ...(draggedEvent.fuelRate != null && { fuelRate: draggedEvent.fuelRate }),
        },
      });

      setEvents((prev) =>
        prev.map((e) =>
          e.id === draggedEvent.id ? { ...e, date: newDate } : e,
        ),
      );
    } catch (err) {
      console.error("Failed to move event:", err);
      setDragError("Failed to move workout. Please try again.");
    } finally {
      setDraggedEvent(null);
      setDragOverDate(null);
    }
  };

  const clearDragError = () => { setDragError(null); };

  return {
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
  };
}
