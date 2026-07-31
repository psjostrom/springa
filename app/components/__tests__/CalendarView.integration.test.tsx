import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { format } from "date-fns";
import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useAtomValue } from "jotai";
import { CalendarView } from "../CalendarView";
import type { CalendarEvent } from "@/lib/types";
import "@/lib/__tests__/setup-dom";
import { server } from "@/lib/__tests__/msw/server";
import { capturedPutPayload, resetCaptures } from "@/lib/__tests__/msw/handlers";
import { calendarEventsAtom } from "@/app/atoms";

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

function CalendarAtomProbe({ eventId }: { eventId: string }) {
  const events = useAtomValue(calendarEventsAtom);
  const event = events.find((e) => e.id === eventId);
  return <div data-testid="shared-calendar-event" data-name={event?.name ?? "missing"} />;
}

function CalendarAtomDateProbe({ eventId }: { eventId: string }) {
  const events = useAtomValue(calendarEventsAtom);
  const event = events.find((e) => e.id === eventId);
  return (
    <div
      data-testid="shared-calendar-date"
      data-date={event ? format(event.date, "yyyy-MM-dd") : "missing"}
    />
  );
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

  it("keeps the successful feel metric patch in CalendarView and syncs Google Calendar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    const googleSyncRequests: unknown[] = [];
    const event = futurePlannedEvent();

    server.use(
      http.post("/api/google-calendar-sync", async ({ request }) => {
        googleSyncRequests.push(await request.json());
        return HttpResponse.json({ synced: true });
      }),
    );

    window.history.replaceState(null, "", "/?workout=event-123");

    render(
      <>
        <CalendarView
          initialEvents={[event]}
          isLoadingInitial={false}
          initialError={null}
        />
        <CalendarAtomProbe eventId="event-123" />
      </>,
      { atomInits: [[calendarEventsAtom, [event]]] },
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: /effort metric/i }),
      "feel",
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "W05 Easy + Strides" })).toBeInTheDocument();
    });
    expect(screen.getByTestId("shared-calendar-event")).toHaveAttribute(
      "data-name",
      "W05 Easy + Strides",
    );

    expect(capturedPutPayload?.body).toEqual({
      name: "W05 Easy + Strides",
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
            name: "W05 Easy + Strides",
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
      expect(screen.queryByRole("heading", { name: "W05 Easy + Strides" })).not.toBeInTheDocument();
    });

    const updatedEvent = await screen.findByText("W05 Easy + Strides");
    await user.click(updatedEvent);

    expect(screen.getByRole("heading", { name: "W05 Easy + Strides" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /effort metric/i })).toHaveValue("feel");
    expect(screen.queryByText("5:24-5:33 /km")).not.toBeInTheDocument();
    expect(googleSyncRequests).toHaveLength(1);
  });

  it("keeps a moved workout on the new date after shared calendar data refreshes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    const event = futurePlannedEvent(); // existing helper; date 2026-02-16

    window.history.replaceState(null, "", "/?workout=event-123");

    const { rerender } = render(
      <>
        <CalendarView
          initialEvents={[event]}
          isLoadingInitial={false}
          initialError={null}
        />
        <CalendarAtomDateProbe eventId="event-123" />
      </>,
      { atomInits: [[calendarEventsAtom, [event]]] },
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "W05 Easy + Strides" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Edit" })); // still Edit until Task 2
    const dateInput = screen.getByDisplayValue("2026-02-16T08:00");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-02-15T08:00");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("shared-calendar-date")).toHaveAttribute(
        "data-date",
        "2026-02-15",
      );
    });

    const movedEvent = { ...event, date: new Date("2026-02-15T08:00:00") };
    rerender(
      <>
        <CalendarView
          initialEvents={[movedEvent]}
          isLoadingInitial={false}
          initialError={null}
        />
        <CalendarAtomDateProbe eventId="event-123" />
      </>,
    );

    expect(screen.getByTestId("shared-calendar-date")).toHaveAttribute(
      "data-date",
      "2026-02-15",
    );
    expect(capturedPutPayload?.body).toEqual({
      start_date_local: "2026-02-15T08:00:00",
    });
  });
});
