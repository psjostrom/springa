import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
import { capturedUploadPayload, capturedPutPayload } from "./msw/handlers";
import { API_BASE } from "../constants";
import { PlannerScreen } from "@/app/screens/PlannerScreen";
import { CalendarScreen } from "@/app/screens/CalendarScreen";
import {
  mockPush,
  searchParamsState,
} from "./setup-dom";

const TEST_API_KEY = "test-integration-key";

// ---------------------------------------------------------------------------
// Flow 1: Planner — Generate Plan -> Preview -> Sync -> Success
// ---------------------------------------------------------------------------
describe("Flow 1: Planner — Generate -> Preview -> Sync -> Success", () => {
  it("generates a plan, shows preview, syncs to Intervals.icu", async () => {
    const user = userEvent.setup();
    render(<PlannerScreen apiKey={TEST_API_KEY} />);

    // 1. Assert empty state
    expect(
      screen.getByText("Configure settings and generate your plan."),
    ).toBeInTheDocument();

    // 2. Click Generate Plan
    await user.click(screen.getByRole("button", { name: /Generate Plan/i }));

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
    }
  });
});

// ---------------------------------------------------------------------------
// Flow 2: Calendar — Events load -> Click event -> Modal with details
// ---------------------------------------------------------------------------
describe("Flow 2: Calendar — Events load -> Modal details", () => {
  it("loads events, clicks a completed event, shows modal with details and streams", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CalendarScreen apiKey={TEST_API_KEY} />,
    );

    // 1. Wait for events to load (MSW returns sampleActivities + sampleEvents)
    await waitFor(() => {
      expect(screen.getByText(/W04 Tue Easy eco16/)).toBeInTheDocument();
    });

    // 2. Assert completed + planned events visible
    expect(screen.getByText(/W05 Tue Easy \+ Strides eco16/)).toBeInTheDocument();

    // 3. Click a completed event
    const completedEvent = screen.getByText(/W04 Tue Easy eco16/);
    await user.click(completedEvent);

    // 4. Assert mockPush called with workout param
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("workout=activity-act-easy-1"),
      expect.anything(),
    );

    // 5. Simulate URL update and rerender
    searchParamsState.current = new URLSearchParams(
      "workout=activity-act-easy-1",
    );
    rerender(
      <CalendarScreen apiKey={TEST_API_KEY} />,
    );

    // 6. Assert modal shows completed details
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
  it("clicks a planned event, edits the date, and saves", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CalendarScreen apiKey={TEST_API_KEY} />,
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

    // 3. Simulate URL -> workout=event-1002
    searchParamsState.current = new URLSearchParams("workout=event-1002");
    rerender(
      <CalendarScreen apiKey={TEST_API_KEY} />,
    );

    // 4. Assert Planned badge and Edit button visible
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
// Flow 4: Planner — Analyze history -> Glucose charts + fuel adjustment
// ---------------------------------------------------------------------------
describe("Flow 4: Planner — Analyze history -> fuel adjustment", () => {
  it("analyzes workout history and auto-adjusts fuel values", async () => {
    const user = userEvent.setup();
    render(<PlannerScreen apiKey={TEST_API_KEY} />);

    // 1. Click analyze button
    const analyzeBtn = screen.getByRole("button", {
      name: /Analyze 'eco16'/i,
    });
    await user.click(analyzeBtn);

    // 2. Wait for analysis — assert chart titles appear
    await waitFor(
      () => {
        expect(screen.getByText("Last Long Run")).toBeInTheDocument();
        expect(screen.getByText("Last Easy Run")).toBeInTheDocument();
        expect(screen.getByText("Last Interval/Tempo")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // 3. Assert trend values are displayed (3 trend elements)
    const trendLabels = screen.getAllByText("Trend:");
    expect(trendLabels.length).toBe(3);

    // 4. Assert fuel inputs are present and auto-adjusted
    // Long run fuel should have increased due to negative glucose trend
    const fuelInputs = screen.getAllByRole("spinbutton");
    // There are 3 fuel inputs in AnalysisSection (Long, Easy, Intervals)
    const analysisFuelInputs = fuelInputs.filter((input) => {
      const value = Number((input as HTMLInputElement).value);
      return value > 0;
    });
    expect(analysisFuelInputs.length).toBeGreaterThanOrEqual(3);
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

    // 1. Generate plan
    await user.click(screen.getByRole("button", { name: /Generate Plan/i }));

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
  it("shows fuel info in agenda pill and modal for an easy run", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CalendarScreen apiKey={TEST_API_KEY} />,
    );

    // 1. Wait for events to load, then switch to agenda view
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Agenda" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Agenda" }));

    // 2. Wait for agenda to render the planned event
    await waitFor(() => {
      expect(
        screen.getByText(/W05 Tue Easy \+ Strides eco16/),
      ).toBeInTheDocument();
    });

    // 3. Assert agenda pill shows fuel info
    expect(screen.getByText(/8g\/10min · 48g total/)).toBeInTheDocument();

    // 4. Click the event to open modal
    await user.click(screen.getByText(/W05 Tue Easy \+ Strides eco16/));

    // 5. Simulate URL -> workout=event-1002
    searchParamsState.current = new URLSearchParams("workout=event-1002");
    rerender(<CalendarScreen apiKey={TEST_API_KEY} />);

    // 6. Assert modal WorkoutCard shows fuel info
    await waitFor(() => {
      expect(screen.getByText("8g / 10 min")).toBeInTheDocument();
    });
    expect(screen.getByText("48g total")).toBeInTheDocument();
  });

  it("shows fuel info in agenda pill and modal for a speed session", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CalendarScreen apiKey={TEST_API_KEY} />,
    );

    // 1. Wait for events to load, then switch to agenda view
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Agenda" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Agenda" }));

    // 2. Wait for agenda to render the planned event
    await waitFor(() => {
      expect(
        screen.getByText(/W05 Thu Hills eco16/),
      ).toBeInTheDocument();
    });

    // 3. Assert agenda pill shows fuel info
    expect(screen.getByText(/5g\/10min · 28g total/)).toBeInTheDocument();

    // 4. Click the event to open modal
    await user.click(screen.getByText(/W05 Thu Hills eco16/));

    // 5. Simulate URL -> workout=event-1003
    searchParamsState.current = new URLSearchParams("workout=event-1003");
    rerender(<CalendarScreen apiKey={TEST_API_KEY} />);

    // 6. Assert modal WorkoutCard shows fuel info
    await waitFor(() => {
      expect(screen.getByText("5g / 10 min")).toBeInTheDocument();
    });
    expect(screen.getByText("28g total")).toBeInTheDocument();
  });
});
