import type { CalendarEvent } from "./types";

export const getEventStyle = (event: CalendarEvent): string => {
  if (event.type === "race") return "bg-red-500 text-white";
  if (event.type === "completed") {
    if (event.category === "long") return "bg-green-600 text-white";
    if (event.category === "interval") return "bg-purple-600 text-white";
    return "bg-green-500 text-white";
  }
  if (event.category === "long") return "bg-green-200 text-green-800";
  if (event.category === "interval") return "bg-purple-200 text-purple-800";
  return "bg-blue-200 text-blue-800";
};

export const getEventIcon = (event: CalendarEvent): string => {
  if (event.type === "race") return "🏁";
  if (event.category === "long") return "🏃";
  if (event.category === "interval") return "⚡";
  return "✓";
};
