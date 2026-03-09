import type { CalendarEvent } from "./types";

export const getEventStyle = (event: CalendarEvent): string => {
  if (event.type === "race") return "bg-[#ff2d95] text-white";
  if (event.type === "completed") {
    if (event.category === "interval") return "bg-[#4a2080] text-white";
    if (event.category === "club") return "bg-[#1a3352] text-[#60a5fa]";
    return "bg-[#1a3d25] text-[#39ff14]";
  }
  if (event.category === "interval") return "bg-[#3d1a6a] text-[#e0d0ff]";
  if (event.category === "club") return "bg-[#1e3a5f] text-[#93c5fd]";
  return "bg-[#0d4a5a] text-[#00ffff]";
};

export function isMissedEvent(event: CalendarEvent): boolean {
  if (event.type !== "planned") return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return event.date < now;
}

export function getEventStatusBadge(event: CalendarEvent): { label: string; className: string } {
  if (isMissedEvent(event)) return { label: "Missed", className: "bg-[#3d1525] text-[#ff6b8a]" };
  if (event.type === "completed") return { label: "Completed", className: getEventStyle(event) };
  if (event.type === "race") return { label: "Race", className: getEventStyle(event) };
  return { label: "Planned", className: getEventStyle(event) };
}

export const getEventIcon = (event: CalendarEvent): string => {
  if (event.type === "race") return "🏁";
  if (event.category === "long") return "🏃";
  if (event.category === "interval") return "⚡";
  if (event.category === "club") return "👥";
  return "✓";
};
