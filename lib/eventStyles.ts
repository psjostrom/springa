import type { CalendarEvent } from "./types";

export const getEventStyle = (event: CalendarEvent): string => {
  if (event.type === "race") return "bg-[#f23b94]/12 text-white border-l-[3px] border-l-[#f23b94]";
  if (event.type === "completed") return "bg-[#4ade80]/12 text-white border-l-[3px] border-l-[#4ade80]";
  if (isMissedEvent(event)) return "bg-[#ff4d6a]/12 text-[#ff4d6a] border-l-[3px] border-l-[#ff4d6a] opacity-70";
  if (event.name.toLowerCase().includes("bonus")) return "bg-[#4a4358]/30 text-[#af9ece] border-l-[3px] border-l-[#4a4358]";
  return "bg-[#f23b94]/12 text-white border-l-[3px] border-l-[#f23b94]";
};

export function isMissedEvent(event: CalendarEvent): boolean {
  if (event.type !== "planned") return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return event.date < now;
}

export function getEventStatusBadge(event: CalendarEvent): { label: string; className: string } {
  if (isMissedEvent(event)) return { label: "Missed", className: "bg-[#1d1828] text-[#ff4d6a]" };
  if (event.type === "completed") return { label: "Completed", className: getEventStyle(event) };
  if (event.type === "race") return { label: "Race", className: getEventStyle(event) };
  return { label: "Planned", className: getEventStyle(event) };
}

export const getEventIcon = (event: CalendarEvent): string => {
  if (event.type === "race") return "🏁";
  if (event.category === "long") return "🏃";
  if (event.category === "interval") return "⚡";
  if (event.name.toLowerCase().includes("club")) return "👥";
  return "✓";
};
