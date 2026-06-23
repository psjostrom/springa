import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { CalendarView } from "../CalendarView";
import type { CalendarEvent } from "@/lib/types";
import "@/lib/__tests__/setup-dom";
import { server } from "@/lib/__tests__/msw/server";
import { capturedPutPayload, resetCaptures } from "@/lib/__tests__/msw/handlers";

function futurePlannedEvent(): CalendarEvent {
  return {
    id: "event-123",
    type: "planned",
    date: new Date("2026-02-16T08:00:00"),
    name: "W05 Easy + Strides",
    description: `Long run with a 3km race pace block sandwiched in the middle.

Warmup
- 1km 6:15-18:20/km Pace intensity=warmup

Main set
- Easy 3km 6:15-18:20/km Pace intensity=active
- Race Pace 3km 5:24-5:33/km Pace intensity=active
- Easy 3km 6:15-18:20/km Pace intensity=active

Cooldown
- 2km 6:15-18:20/km Pace intensity=cooldown`,
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
    server.resetHandlers();
    resetCaptures();
    window.history.replaceState(null, "", "/");
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

  it("keeps the successful By Feel patch in CalendarView and syncs Google Calendar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    const googleSyncRequests: unknown[] = [];

    server.use(
      http.post("/api/google-calendar-sync", async ({ request }) => {
        googleSyncRequests.push(await request.json());
        return HttpResponse.json({ synced: true });
      }),
    );

    window.history.replaceState(null, "", "/?workout=event-123");

    render(
      <CalendarView
        initialEvents={[futurePlannedEvent()]}
        isLoadingInitial={false}
        initialError={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: "By Feel" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "W05 Easy + Strides By Feel" })).toBeInTheDocument();
    });

    expect(capturedPutPayload?.body).toEqual({
      name: "W05 Easy + Strides By Feel",
      description: `Long run with a 3km race pace block sandwiched in the middle.

Warmup
- 1km intensity=warmup

Main set
- Easy 3km intensity=active
- Race Pace 3km intensity=active
- Easy 3km intensity=active

Cooldown
- 2km intensity=cooldown`,
    });
    await waitFor(() => {
      expect(googleSyncRequests).toEqual([
        {
          action: "update",
          eventName: "W05 Easy + Strides",
          eventDate: "2026-02-16",
          event: {
            name: "W05 Easy + Strides By Feel",
            description: `Long run with a 3km race pace block sandwiched in the middle.

Warmup
- 1km intensity=warmup

Main set
- Easy 3km intensity=active
- Race Pace 3km intensity=active
- Easy 3km intensity=active

Cooldown
- 2km intensity=cooldown`,
            startLocal: "2026-02-16T08:00:00",
          },
        },
      ]);
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "W05 Easy + Strides By Feel" })).not.toBeInTheDocument();
    });

    const updatedEvent = await screen.findByText("W05 Easy + Strides By Feel");
    await user.click(updatedEvent);

    expect(screen.getByRole("heading", { name: "W05 Easy + Strides By Feel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "By Feel" })).toBeNull();
    expect(screen.queryByText("5:24-5:33 /km")).not.toBeInTheDocument();
    expect(googleSyncRequests).toHaveLength(1);
  });
});
