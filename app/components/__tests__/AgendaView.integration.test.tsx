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

function makeRaceEvent(date: string): CalendarEvent {
  // Real race descriptions follow the workout-step format so the strip can derive a
  // total (totalCarbs is no longer a stored field). 16km × ~5:38/km midpoint ≈ 90 min.
  return {
    id: "race-1",
    date: new Date(date),
    name: "RACE DAY",
    description: "Race day. 16km at race effort.\n\n- Race 16km 5:32-5:43/km Pace intensity=active\n",
    type: "race",
    category: "race",
    fuelRate: 72,
    prescribedCarbsG: 108,
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

  it("shows race-day fuel recommendation chip", () => {
    vi.setSystemTime(new Date("2026-04-23T10:00:00"));

    render(
      <AgendaView
        events={[makeRaceEvent("2026-04-24T09:00:00")]}
        onSelectEvent={() => {}}
        onGenerateWorkout={() => {}}
      />,
    );

    // 16km × ~5:38/km midpoint = ~90 min × 72g/h ÷ 60 = 108g (no threshold passed in this test).
    expect(screen.getByText("72g/h · 108g total")).toBeInTheDocument();
  });
});