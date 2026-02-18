import { useState, useCallback } from "react";
import { format } from "date-fns";
import type { CalendarEvent } from "@/lib/types";
import { updateEvent } from "@/lib/intervalsApi";
import { parseEventId } from "@/lib/utils";

export function useDragDrop(
  apiKey: string,
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>,
) {
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, event: CalendarEvent) => {
    if (event.type !== "planned") return;
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", event.id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedEvent(null);
    setDragOverDate(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!draggedEvent) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, [draggedEvent]);

  const handleDragEnter = useCallback((dateKey: string) => {
    if (!draggedEvent) return;
    setDragOverDate(dateKey);
  }, [draggedEvent]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!draggedEvent) return;
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && (e.currentTarget as HTMLElement).contains(relatedTarget)) return;
    setDragOverDate(null);
  }, [draggedEvent]);

  const handleDrop = useCallback(async (targetDate: Date) => {
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

    try {
      await updateEvent(apiKey, numericId, { start_date_local: newDateLocal });
      setEvents((prev) =>
        prev.map((e) =>
          e.id === draggedEvent.id ? { ...e, date: newDate } : e,
        ),
      );
    } catch (err) {
      console.error("Failed to move event:", err);
      alert("Failed to move workout. Please try again.");
    } finally {
      setDraggedEvent(null);
      setDragOverDate(null);
    }
  }, [draggedEvent, apiKey, setEvents]);

  return {
    draggedEvent,
    dragOverDate,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  };
}
