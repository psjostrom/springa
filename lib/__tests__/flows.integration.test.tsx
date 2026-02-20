import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { capturedUploadPayload, capturedPutPayload, capturedDeleteEventIds } from "./msw/handlers";
import { API_BASE } from "../constants";
import { PlannerScreen } from "@/app/screens/PlannerScreen";
import { CalendarScreen } from "@/app/screens/CalendarScreen";
import { useSharedCalendarData } from "@/app/hooks/useSharedCalendarData";
import "./setup-dom";

const TEST_API_KEY = "test-integration-key";

/** Test wrapper that combines shared data hook + CalendarScreen, matching the prod wiring in page.tsx. */
function TestCalendarScreen({ apiKey }: { apiKey: string }) {
  const { events, isLoading, error, reload } = useSharedCalendarData(apiKey);
  return (
    <CalendarScreen
      apiKey={apiKey}
      initialEvents={events}
      isLoadingInitial={isLoading}
      initialError={error}
      onRetryLoad={reload}
    />
  );
}

// ---------------------------------------------------------------------------
// Flow 1: Planner — Generate Plan -> Preview -> Sync -> Success
// ---------------------------------------------------------------------------
describe("Flow 1: Planner — Generate -> Preview -> Sync -> Success", () => {
  it("generates a plan, shows preview, syncs to Intervals.icu", async () => {
    const user = userEvent.setup();
    render(<PlannerScreen apiKey={TEST_API_KEY} />);

    // 1. Click Generate Plan (two buttons exist: desktop sidebar + mobile; click first)
    const generateBtns = screen.getAllByRole("button", { name: /Generate Plan/i });
    await user.click(generateBtns[0]);

    // 3. Assert preview heading appears with workout cards
    await waitFor(() => {
      expect(screen.getByText("Preview")).toBeInTheDocument();
    });
    // Verify workouts contain the prefix
    const cards = screen.getAllByText(/eco16/);
    expect(cards.length).toBeGreaterThan(0);

    // 4. Assert action bar
    expect(screen.getByText("Ready to sync?")).toBeInTheDocument();
    expect(screen.getByText(/workouts generated\./)).toBeInTheDocument();

    // 5. Click Sync
    await user.click(screen.getByRole("button", { name: /Sync/i }));

    // 6. Assert success message
    await waitFor(() => {
      expect(screen.getByText(/Uploaded \d+ workouts/)).toBeInTheDocument();
    });

    // 7. Assert MSW captured correct POST payload
    expect(capturedUploadPayload.length).toBeGreaterThan(0);
    for (const item of capturedUploadPayload as Record<string, unknown>[]) {
      expect(item.category).toBe("WORKOUT");
      expect(item.type).toBe("Run");
      // All events should have carbs_per_hour set
      expect(item.carbs_per_hour).toBeDefined();
      expect(typeof item.carbs_per_hour).toBe("number");
      // Descriptions should NOT contain fuel text
      expect(item.description).not.toContain("FUEL PER 10:");
    }
  });
});

// ---------------------------------------------------------------------------
// Flow 2: Calendar — Events load -> Click event -> Modal with details
// ---------------------------------------------------------------------------
describe("Flow 2: Calendar — Events load -> Modal details", () => {
  it("loads events, clicks a completed event, shows modal with details and streams", async () => {
    const user = userEvent.setup();
    render(
      <TestCalendarScreen apiKey={TEST_API_KEY} />,
    );

    // 1. Wait for events to load (MSW returns sampleActivities + sampleEvents)
    await waitFor(() => {
      expect(screen.getAllByText(/W04 Tue Easy eco16/).length).toBeGreaterThanOrEqual(1);
    });

    // 2. Assert completed + planned events visible
    expect(screen.getAllByText(/W05 Tue Easy \+ Strides eco16/).length).toBeGreaterThanOrEqual(1);

    // 3. Click a completed event
    const completedEvent = screen.getAllByText(/W04 Tue Easy eco16/)[0];
    await user.click(completedEvent);

    // 4. Assert URL updated with workout param
    expect(window.location.search).toContain("workout=activity-act-easy-1");

    // 5. Assert modal shows completed details
    await waitFor(() => {
      expect(screen.getByText(/Completed/)).toBeInTheDocument();
    });
    expect(screen.getByText("Distance")).toBeInTheDocument();
    expect(screen.getByText("6.50 km")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();

    // 7. Wait for stream data lazy-load -> HR zone breakdown
    await waitFor(
      () => {
        expect(screen.getByText("Heart Rate Zones")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Flow 3: Calendar — Click planned event -> Edit date -> Save
// ---------------------------------------------------------------------------
describe("Flow 3: Calendar — Edit planned event date", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-02-09T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clicks a planned event, edits the date, and saves", async () => {
    const user = userEvent.setup();
    render(
      <TestCalendarScreen apiKey={TEST_API_KEY} />,
    );

    // 1. Wait for events
    await waitFor(() => {
      expect(
        screen.getByText(/W05 Tue Easy \+ Strides eco16/),
      ).toBeInTheDocument();
    });

    // 2. Click the planned event
    const plannedEvent = screen.getByText(/W05 Tue Easy \+ Strides eco16/);
    await user.click(plannedEvent);

    // 3. Assert Planned badge and Edit button visible
    await waitFor(() => {
      expect(screen.getByText(/Planned/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();

    // 5. Click Edit -> datetime-local input appears
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const dateInput = screen.getByDisplayValue(/2026-02-17/);
    expect(dateInput).toBeInTheDocument();

    // 6. Change date via fireEvent.change (jsdom doesn't fully support datetime-local with userEvent)
    fireEvent.change(dateInput, { target: { value: "2026-02-20T14:00" } });

    // 7. Click Save
    await user.click(screen.getByRole("button", { name: "Save" }));

    // 8. Wait for save to complete
    await waitFor(() => {
      expect(capturedPutPayload).not.toBeNull();
    });

    // 9. Assert captured PUT payload
    expect(capturedPutPayload!.url).toContain("/events/1002");
    expect(
      (capturedPutPayload!.body as Record<string, string>).start_date_local,
    ).toBe("2026-02-20T14:00:00");
  });
});

// ---------------------------------------------------------------------------
// Flow 4: Planner — Generate uses fuel settings directly (no analysis)
// ---------------------------------------------------------------------------
describe("Flow 4: Planner — Generate uses fuel settings directly", () => {
  it("generates plan instantly using sidebar fuel values", async () => {
    const user = userEvent.setup();
    render(<PlannerScreen apiKey={TEST_API_KEY} />);

    // 1. Click Generate Plan
    const generateBtns = screen.getAllByRole("button", { name: /Generate Plan/i });
    await user.click(generateBtns[0]);

    // 2. Plan generates synchronously — action bar visible immediately
    await waitFor(() => {
      expect(screen.getByText("Ready to sync?")).toBeInTheDocument();
    });

    // 3. Workout list is rendered (plan was generated)
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Flow 5: Planner — Sync resilience when DELETE fails
// ---------------------------------------------------------------------------
describe("Flow 5: Planner — Sync resilience on delete failure", () => {
  beforeEach(() => {
    // Override DELETE handler to return 500
    server.use(
      http.delete(`${API_BASE}/athlete/0/events`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );
  });

  it("uploads successfully even when DELETE returns 500", async () => {
    const user = userEvent.setup();
    render(<PlannerScreen apiKey={TEST_API_KEY} />);

    // 1. Generate plan (two buttons: desktop + mobile; click first)
    const generateBtns = screen.getAllByRole("button", { name: /Generate Plan/i });
    await user.click(generateBtns[0]);

    await waitFor(() => {
      expect(screen.getByText("Preview")).toBeInTheDocument();
    });

    // 2. Click Sync
    await user.click(screen.getByRole("button", { name: /Sync/i }));

    // 3. Assert success message still appears despite delete failure
    await waitFor(() => {
      expect(screen.getByText(/Uploaded \d+ workouts/)).toBeInTheDocument();
    });

    // 4. Assert MSW captured POST payload
    expect(capturedUploadPayload.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Flow 6: Calendar — BG strategy consistency between agenda and modal
// ---------------------------------------------------------------------------
describe("Flow 6: Calendar — Fuel info matches in agenda and modal", () => {
  beforeEach(() => {
    // Pin date before all fixture events so they appear in "upcoming"
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-02-09T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows fuel info in agenda pill and modal for an easy run", async () => {
    const user = userEvent.setup();
    render(
      <TestCalendarScreen apiKey={TEST_API_KEY} />,
    );

    // 1. Wait for events to load, then switch to agenda view
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Agenda" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Agenda" }));

    // 2. Wait for agenda to render the planned event (name appears in both month + agenda views)
    await waitFor(() => {
      expect(
        screen.getAllByText(/W05 Tue Easy \+ Strides eco16/).length,
      ).toBeGreaterThanOrEqual(1);
    });

    // 3. Assert fuel info visible (appears in both month cell and agenda pill)
    expect(screen.getAllByText(/48g\/h/).length).toBeGreaterThanOrEqual(1);

    // 4. Click the event to open modal (click last match = agenda view)
    const matches = screen.getAllByText(/W05 Tue Easy \+ Strides eco16/);
    await user.click(matches[matches.length - 1]);

    // 5. Assert modal WorkoutCard shows fuel info
    await waitFor(() => {
      expect(screen.getByText("48g/h")).toBeInTheDocument();
    });
  });

  it("shows fuel info in agenda pill and modal for a speed session", async () => {
    const user = userEvent.setup();
    render(
      <TestCalendarScreen apiKey={TEST_API_KEY} />,
    );

    // 1. Wait for events to load, then switch to agenda view
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Agenda" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Agenda" }));

    // 2. Wait for agenda to render the planned event (may appear in both month + agenda views)
    await waitFor(() => {
      expect(
        screen.getAllByText(/W05 Thu Hills eco16/).length,
      ).toBeGreaterThanOrEqual(1);
    });

    // 3. Assert fuel info visible (may appear in both month cell and agenda pill)
    expect(screen.getAllByText(/30g\/h/).length).toBeGreaterThanOrEqual(1);

    // 4. Click the event to open modal (click last match = agenda view)
    const hillMatches = screen.getAllByText(/W05 Thu Hills eco16/);
    await user.click(hillMatches[hillMatches.length - 1]);

    // 5. Assert modal WorkoutCard shows fuel info
    await waitFor(() => {
      expect(screen.getByText("30g/h")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Flow 7: Calendar — Delete planned event from modal
// ---------------------------------------------------------------------------
describe("Flow 7: Calendar — Delete planned event from modal", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-02-09T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a planned event, clicks Delete, confirms, and event is removed", async () => {
    const user = userEvent.setup();
    render(
      <TestCalendarScreen apiKey={TEST_API_KEY} />,
    );

    // 1. Wait for events to load
    await waitFor(() => {
      expect(
        screen.getByText(/W05 Tue Easy \+ Strides eco16/),
      ).toBeInTheDocument();
    });

    // 2. Click the planned event
    const plannedEvent = screen.getByText(/W05 Tue Easy \+ Strides eco16/);
    await user.click(plannedEvent);

    // 3. Assert Planned badge and Delete button visible
    await waitFor(() => {
      expect(screen.getByText(/Planned/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

    // 5. Click Delete -> confirmation appears
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete this workout?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();

    // 6. Click Confirm
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    // 7. Assert DELETE request was made with correct event ID
    await waitFor(() => {
      expect(capturedDeleteEventIds).toContain("1002");
    });

    // 7. Assert event is removed from the DOM
    await waitFor(() => {
      expect(
        screen.queryByText(/W05 Tue Easy \+ Strides eco16/),
      ).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Flow 8: Calendar — Long run totalCarbs uses our pace estimate, not API duration
// ---------------------------------------------------------------------------
describe("Flow 8: Calendar — Long run totalCarbs uses description pace estimate", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-02-09T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 58g total (not 49g) for an 8km long run at 60g/h", async () => {
    // Fixture event-1004 has duration: 2940 (49 min from Intervals.icu)
    // but our description-based estimate is ~58 min (8km × 7.25 min/km).
    // The modal must show 58g, not 49g.
    const user = userEvent.setup();
    render(
      <TestCalendarScreen apiKey={TEST_API_KEY} />,
    );

    // 1. Wait for events to load
    await waitFor(() => {
      expect(
        screen.getByText(/W05 Sun Long \(8km\) eco16/),
      ).toBeInTheDocument();
    });

    // 2. Click the planned long run
    await user.click(screen.getByText(/W05 Sun Long \(8km\) eco16/));

    // 3. Assert modal shows correct fuel strip values
    await waitFor(() => {
      expect(screen.getByText("60g/h")).toBeInTheDocument();
    });
    expect(screen.getByText("58g total")).toBeInTheDocument();
  });
});
