import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import type { CalendarEvent } from "@/lib/types";
import { calendarEventsAtom } from "../../atoms";
import { EventModal } from "../EventModal";
import { TEST_HR_ZONES, TEST_LTHR } from "@/lib/__tests__/testConstants";

const HILLS_DESCRIPTION = `Hill reps build strength and power.

Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- Uphill 2m 99-111% LTHR (167-188 bpm)
- Downhill 3m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

const basePlanned: CalendarEvent = {
  id: "event-100",
  date: new Date("2099-03-10T14:00:00"),
  name: "W02 Hills",
  description: HILLS_DESCRIPTION,
  type: "planned",
  category: "interval",
  fuelRate: 30,
  totalCarbs: 25,
};

const baseCompleted: CalendarEvent = {
  id: "e200",
  date: new Date("2026-03-08T10:00:00"),
  name: "W02 Long (10km)",
  description: HILLS_DESCRIPTION,
  type: "completed",
  category: "long",
  distance: 10000,
  duration: 3600,
  avgHr: 135,
  zoneTimes: { z1: 60, z2: 1800, z3: 900, z4: 300, z5: 60 },
  streamData: {
    heartrate: [
      { time: 0, value: 110 },
      { time: 600, value: 130 },
      { time: 1200, value: 145 },
      { time: 1800, value: 140 },
      { time: 2400, value: 135 },
      { time: 3000, value: 128 },
      { time: 3600, value: 115 },
    ],
  },
};

const noop = () => {};
const noopAsync = async () => {};

const baseRace: CalendarEvent = {
  id: "e300",
  date: new Date("2026-06-13T09:00:00"),
  name: "EcoTrail 16km",
  description: "Race day!",
  type: "race",
  category: "race",
  fuelRate: 60,
  totalCarbs: 120,
};

describe("EventModal race event", () => {
  it("renders Race badge and event name", () => {
    render(
      <EventModal
        event={baseRace}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    expect(screen.getByText("Race")).toBeInTheDocument();
    expect(screen.getByText("EcoTrail 16km")).toBeInTheDocument();
  });
});

describe("EventModal workout card", () => {
  it("renders workout structure for a planned event", () => {
    render(
      <EventModal
        event={basePlanned}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
        hrZones={[...TEST_HR_ZONES]}
        lthr={TEST_LTHR}
      />,
    );

    // WorkoutCard renders the parsed structure as visible text
    expect(screen.getByText("Warmup")).toBeInTheDocument();
    expect(screen.getByText("Main set")).toBeInTheDocument();
    expect(screen.getByText("6x")).toBeInTheDocument();
    expect(screen.getByText("Cooldown")).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
  });

  it("renders stats for a completed event", () => {
    render(
      <EventModal
        event={baseCompleted}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    expect(screen.getByText("10.00 km")).toBeInTheDocument();
    expect(screen.getByText("60 min")).toBeInTheDocument();
    expect(screen.getByText("135 bpm")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("shows Heart Rate Zones heading while loading stream data", async () => {
    const user = userEvent.setup();
    const loading: CalendarEvent = {
      ...baseCompleted,
      streamData: undefined,
    };

    render(
      <EventModal
        event={loading}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        isLoadingStreamData
        apiKey="test"
      />,
    );

    // HR Zones is in the Deep Dive tab
    await user.click(screen.getByText("Deep Dive"));
    expect(screen.getByText("Heart Rate Zones")).toBeInTheDocument();
  });

  it("does not show Heart Rate Zones when no data and not loading", async () => {
    const user = userEvent.setup();
    const noZones: CalendarEvent = {
      ...baseCompleted,
      streamData: undefined,
      zoneTimes: undefined,
    };

    render(
      <EventModal
        event={noZones}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        isLoadingStreamData={false}
        apiKey="test"
      />,
    );

    await user.click(screen.getByText("Deep Dive"));
    expect(screen.queryByText("Heart Rate Zones")).toBeNull();
  });
});

describe("EventModal feedback", () => {
  const completedWithActivity: CalendarEvent = {
    ...baseCompleted,
    activityId: "i999",
  };

  it("shows rating buttons for unrated completed run", async () => {
    const user = userEvent.setup();
    render(
      <EventModal
        event={completedWithActivity}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Feedback is on Overview tab (no need to switch)
    expect(screen.getByText("Feedback")).toBeInTheDocument();
    expect(screen.getByText("\ud83d\udc4d")).toBeInTheDocument();
    expect(screen.getByText("\ud83d\udc4e")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("shows read-only rating for already-rated run", async () => {
    const user = userEvent.setup();
    const rated: CalendarEvent = {
      ...completedWithActivity,
      rating: "good",
      feedbackComment: "Felt great",
    };

    render(
      <EventModal
        event={rated}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Feedback is on Overview tab (no need to switch)
    expect(screen.getByText("Feedback")).toBeInTheDocument();
    expect(screen.getByText("\ud83d\udc4d")).toBeInTheDocument();
    expect(screen.getByText("Felt great")).toBeInTheDocument();
    // No Save button in read-only mode
    expect(screen.queryByText("Save")).toBeNull();
  });

  it("shows read-only bad rating without comment", async () => {
    const user = userEvent.setup();
    const rated: CalendarEvent = {
      ...completedWithActivity,
      rating: "bad",
    };

    render(
      <EventModal
        event={rated}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Feedback is on Overview tab (no need to switch)
    expect(screen.getByText("\ud83d\udc4e")).toBeInTheDocument();
    expect(screen.queryByText("Save")).toBeNull();
  });

  it("does not show feedback for completed run without activityId", () => {
    const noActivity: CalendarEvent = {
      ...baseCompleted,
      activityId: undefined,
    };

    render(
      <EventModal
        event={noActivity}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    expect(screen.queryByText("Feedback")).toBeNull();
  });

  it("does not show feedback for planned events", () => {
    render(
      <EventModal
        event={basePlanned}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    expect(screen.queryByText("Feedback")).toBeNull();
  });

  it("Save button is disabled until a rating is selected", async () => {
    const user = userEvent.setup();
    render(
      <EventModal
        event={completedWithActivity}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Feedback is on Overview tab (no need to switch)
    const saveBtn = screen.getByText("Save");
    expect(saveBtn).toBeDisabled();
  });

  it("Save button enables after selecting a rating", async () => {
    const user = userEvent.setup();

    render(
      <EventModal
        event={completedWithActivity}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Feedback is on Overview tab (no need to switch)
    await user.click(screen.getByText("\ud83d\udc4d"));
    const saveBtn = screen.getByText("Save");
    expect(saveBtn).not.toBeDisabled();
  });

  it("saves feedback and switches to read-only", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.post("/api/run-feedback", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true });
      }),
    );

    render(
      <EventModal
        event={completedWithActivity}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
      { atomInits: [[calendarEventsAtom, [completedWithActivity]]] },
    );

    // Feedback is on Overview tab (no need to switch)
    await user.click(screen.getByText("\ud83d\udc4e"));
    const commentInput = screen.getByPlaceholderText("Optional comment...");
    await user.type(commentInput, "Legs were heavy");
    await user.click(screen.getByText("Save"));

    // After save, should switch to read-only
    expect(await screen.findByText("Legs were heavy")).toBeInTheDocument();
    expect(screen.getByText("\ud83d\udc4e")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Optional comment...")).toBeNull();

    // Verify the API call
    expect(capturedBody).toEqual({
      activityId: "i999",
      rating: "bad",
      comment: "Legs were heavy",
    });
  });
});

describe("EventModal pre-run carbs for planned events", () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it("shows pre-run carbs input for planned events", async () => {
    server.use(
      http.get("/api/prerun-carbs", () => {
        return HttpResponse.json({ carbsG: null });
      }),
    );

    render(
      <EventModal
        event={basePlanned}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Pre-run carbs")).toBeInTheDocument();
    });
    expect(screen.getByText("Add")).toBeInTheDocument();
  });

  it("displays existing pre-run carbs from API", async () => {
    server.use(
      http.get("/api/prerun-carbs", () => {
        return HttpResponse.json({ carbsG: 30 });
      }),
    );

    render(
      <EventModal
        event={basePlanned}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("30g")).toBeInTheDocument();
    });
  });

  it("allows editing and saving pre-run carbs", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> | null = null;

    server.use(
      http.get("/api/prerun-carbs", () => {
        return HttpResponse.json({ carbsG: null });
      }),
      http.post("/api/prerun-carbs", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true });
      }),
    );

    render(
      <EventModal
        event={basePlanned}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText("Add")).toBeInTheDocument();
    });

    // Click Add to start editing
    await user.click(screen.getByText("Add"));

    // Fill in the value
    const gInput = screen.getByPlaceholderText("g");
    await user.type(gInput, "35");

    // Save
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Should display saved value
    await waitFor(() => {
      expect(screen.getByText("35g")).toBeInTheDocument();
    });

    // Verify API call - eventId should be normalized (prefix "event-" stripped)
    expect(capturedBody).toEqual({
      eventId: "100",
      carbsG: 35,
    });
  });

  it("does not show pre-run carbs input for completed events", () => {
    render(
      <EventModal
        event={baseCompleted}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Should not show the "Add" button or pre-run carbs label in the planned section
    // (completed events have a different pre-run carbs section)
    expect(screen.queryByText("Add")).toBeNull();
  });
});

describe("EventModal run analysis", () => {
  afterEach(() => {
    server.resetHandlers();
  });

  const completedWithActivity: CalendarEvent = {
    ...baseCompleted,
    activityId: "i999",
  };

  it("shows run analysis for completed event with activityId", async () => {
    const user = userEvent.setup();
    render(
      <EventModal
        event={completedWithActivity}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Run Analysis is on the Analysis tab
    await user.click(screen.getByText("Analysis"));
    // Wait for analysis to load (MSW returns "Test analysis.")
    expect(await screen.findByText("Run Analysis")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Test analysis.")).toBeInTheDocument();
    });
  });

  it("shows regenerate button after analysis loads", async () => {
    const user = userEvent.setup();
    render(
      <EventModal
        event={completedWithActivity}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Run Analysis is on the Analysis tab
    await user.click(screen.getByText("Analysis"));
    // Wait for analysis to load
    await waitFor(() => {
      expect(screen.getByText("Test analysis.")).toBeInTheDocument();
    });

    // Regenerate button should be visible (aria-label)
    expect(screen.getByRole("button", { name: "Regenerate analysis" })).toBeInTheDocument();
  });

  it("regenerates analysis when regenerate button is clicked", async () => {
    const user = userEvent.setup();
    let callCount = 0;

    server.use(
      http.post("/api/run-analysis", () => {
        callCount++;
        return HttpResponse.json({ analysis: `Analysis v${callCount}` });
      }),
    );

    render(
      <EventModal
        event={completedWithActivity}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Run Analysis is on the Analysis tab
    await user.click(screen.getByText("Analysis"));
    // Wait for initial analysis
    await waitFor(() => {
      expect(screen.getByText("Analysis v1")).toBeInTheDocument();
    });

    // Click regenerate
    await user.click(screen.getByRole("button", { name: "Regenerate analysis" }));

    // Wait for new analysis
    await waitFor(() => {
      expect(screen.getByText("Analysis v2")).toBeInTheDocument();
    });

    expect(callCount).toBe(2);
  });

  it("shows loading state during regeneration", async () => {
    const user = userEvent.setup();
    let requestCount = 0;

    server.use(
      http.post("/api/run-analysis", async () => {
        requestCount++;
        if (requestCount === 1) {
          // First request (initial load) - return immediately
          return HttpResponse.json({ analysis: "Initial analysis" });
        }
        // Second request (regeneration) - delay to show loading state
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({ analysis: "New analysis" });
      }),
    );

    render(
      <EventModal
        event={completedWithActivity}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Run Analysis is on the Analysis tab
    await user.click(screen.getByText("Analysis"));
    // Wait for initial analysis
    await waitFor(() => {
      expect(screen.getByText("Initial analysis")).toBeInTheDocument();
    });

    // Click regenerate - button should show loading state
    await user.click(screen.getByRole("button", { name: "Regenerate analysis" }));

    // Button should be disabled during loading
    expect(screen.getByRole("button", { name: "Regenerate analysis" })).toBeDisabled();

    // Wait for button to be enabled again after loading completes
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Regenerate analysis" })).not.toBeDisabled();
    });

    // New analysis should be displayed
    expect(screen.getByText("New analysis")).toBeInTheDocument();
  });
});
