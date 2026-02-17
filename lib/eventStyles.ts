import type { CalendarEvent } from "./types";

export const getEventStyle = (event: CalendarEvent): string => {
  if (event.type === "race") return "bg-[#ff2d95] text-white";
  if (event.type === "completed") {
    if (event.category === "long") return "bg-[#1a3d25] text-[#39ff14]";
    if (event.category === "interval") return "bg-[#4a2080] text-white";
    return "bg-[#1a3d25] text-[#39ff14]";
  }
  if (event.category === "long") return "bg-[#0d4a5a] text-[#00ffff]";
  if (event.category === "interval") return "bg-[#3d1a6a] text-[#e0d0ff]";
  return "bg-[#0d4a5a] text-[#00ffff]";
};

export const getEventIcon = (event: CalendarEvent): string => {
  if (event.type === "race") return "🏁";
  if (event.category === "long") return "🏃";
  if (event.category === "interval") return "⚡";
  return "✓";
};
