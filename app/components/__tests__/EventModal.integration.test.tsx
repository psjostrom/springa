import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import type { CalendarEvent } from "@/lib/types";
import { EventModal } from "../EventModal";
import "../..//../lib/__tests__/setup-dom";

const HILLS_DESCRIPTION = `Hill reps build strength and power.

Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- Uphill 2m 99-111% LTHR (167-188 bpm)
- Downhill 3m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

const basePlanned: CalendarEvent = {
  id: "e100",
  date: new Date("2026-03-10T14:00:00"),
  name: "W02 Hills eco16",
  description: HILLS_DESCRIPTION,
  type: "planned",
  category: "interval",
  fuelRate: 30,
  totalCarbs: 25,
};

const baseCompleted: CalendarEvent = {
  id: "e200",
  date: new Date("2026-03-08T10:00:00"),
  name: "W02 Long (10km) eco16",
  description: HILLS_DESCRIPTION,
  type: "completed",
  category: "long",
  distance: 10000,
  duration: 3600,
  avgHr: 135,
  hrZones: { z1: 60, z2: 1800, z3: 900, z4: 300, z5: 60 },
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
    expect(screen.getByText("Heart Rate Zones")).toBeInTheDocument();
  });

  it("shows Heart Rate Zones heading while loading stream data", () => {
    const loading: CalendarEvent = {
      ...baseCompleted,
      hrZones: undefined,
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

    // HR zones heading is shown even during loading (skeleton content below it)
    expect(screen.getByText("Heart Rate Zones")).toBeInTheDocument();
  });

  it("does not show Heart Rate Zones when no data and not loading", () => {
    const noZones: CalendarEvent = {
      ...baseCompleted,
      hrZones: undefined,
      streamData: undefined,
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

    expect(screen.queryByText("Heart Rate Zones")).toBeNull();
  });
});

describe("EventModal feedback", () => {
  const completedWithActivity: CalendarEvent = {
    ...baseCompleted,
    activityId: "i999",
  };

  it("shows rating buttons for unrated completed run", () => {
    render(
      <EventModal
        event={completedWithActivity}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    expect(screen.getByText("Feedback")).toBeInTheDocument();
    expect(screen.getByText("\ud83d\udc4d")).toBeInTheDocument();
    expect(screen.getByText("\ud83d\udc4e")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("shows read-only rating for already-rated run", () => {
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

    expect(screen.getByText("Feedback")).toBeInTheDocument();
    expect(screen.getByText("\ud83d\udc4d")).toBeInTheDocument();
    expect(screen.getByText("Felt great")).toBeInTheDocument();
    // No Save button in read-only mode
    expect(screen.queryByText("Save")).toBeNull();
  });

  it("shows read-only bad rating without comment", () => {
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

  it("Save button is disabled until a rating is selected", () => {
    render(
      <EventModal
        event={completedWithActivity}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

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
    );

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
