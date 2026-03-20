import type { CalendarEvent } from "./types";

export const getEventStyle = (event: CalendarEvent): string => {
  if (event.type === "race") return "bg-brand/12 text-text border-l-[3px] border-l-brand";
  if (event.type === "completed") return "bg-success/12 text-text border-l-[3px] border-l-success";
  if (isMissedEvent(event)) return "bg-error/12 text-error border-l-[3px] border-l-error opacity-70";
  if (event.name.toLowerCase().includes("bonus")) return "bg-border-subtle/30 text-muted border-l-[3px] border-l-border-subtle";
  return "bg-brand/12 text-text border-l-[3px] border-l-brand";
};

export function isMissedEvent(event: CalendarEvent): boolean {
  if (event.type !== "planned") return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return event.date < now;
}

export function getEventStatusBadge(event: CalendarEvent): { label: string; className: string } {
  if (isMissedEvent(event)) return { label: "Missed", className: "bg-surface text-error" };
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
