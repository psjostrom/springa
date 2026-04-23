import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import { CalendarView } from "../CalendarView";
import type { CalendarEvent } from "@/lib/types";
import "@/lib/__tests__/setup-dom";

function futurePlannedEvent(): CalendarEvent {
  return {
    id: "event-123",
    type: "planned",
    date: new Date("2026-02-16T08:00:00"),
    name: "W05 Easy + Strides",
    description: "10m warmup",
    category: "easy",
  };
}

describe("CalendarView", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-02-15T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears stale local events when shared calendar data becomes empty", async () => {
    const { rerender } = render(
      <CalendarView initialEvents={[]} isLoadingInitial={false} initialError={null} />,
    );

    rerender(
      <CalendarView initialEvents={[futurePlannedEvent()]} isLoadingInitial={false} initialError={null} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/W05 Easy \+ Strides/).length).toBeGreaterThanOrEqual(1);
    });

    rerender(
      <CalendarView initialEvents={[]} isLoadingInitial={false} initialError={null} />,
    );

    await waitFor(() => {
      expect(screen.queryByText(/W05 Easy \+ Strides/)).not.toBeInTheDocument();
    });
  });
});