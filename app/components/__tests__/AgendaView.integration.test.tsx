import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@/lib/__tests__/test-utils";
import type { CalendarEvent } from "@/lib/types";
import { AgendaView } from "../AgendaView";

function makePlannedEvent(date: string): CalendarEvent {
  return {
    id: "planned-1",
    date: new Date(date),
    name: "W05 Easy",
    description: "",
    type: "planned",
    category: "easy",
  };
}

describe("AgendaView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates the today CTA after midnight without needing a parent rerender", () => {
    vi.setSystemTime(new Date("2026-04-23T23:55:00"));

    render(
      <AgendaView
        events={[makePlannedEvent("2026-04-24T09:00:00")]}
        onSelectEvent={() => {}}
        onGenerateWorkout={() => {}}
      />,
    );

    expect(screen.getByText("Generate workout for today")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(screen.queryByText("Generate workout for today")).not.toBeInTheDocument();
  });
});