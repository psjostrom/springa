import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
  it("renders Race badge for race event", () => {
    const { container } = render(
      <EventModal
        event={baseRace}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // Badge text
    expect(container.textContent).toContain("Race");
    // Race badge uses pink (#ff2d95)
    const badge = container.querySelector("[class*='ff2d95']");
    expect(badge).not.toBeNull();
  });

  it("renders event name for race event", () => {
    render(
      <EventModal
        event={baseRace}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );
    expect(screen.getByText("EcoTrail 16km")).toBeInTheDocument();
  });
});

describe("EventModal zone bar", () => {
  it("renders WorkoutStructureBar for a planned event with a description", () => {
    const { container } = render(
      <EventModal
        event={basePlanned}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // WorkoutStructureBar renders a flex container with colored divs based on segments.
    // The bar sits inside WorkoutCard's structure area, between sections and zone paces.
    // Each segment is a div with a backgroundColor style — check that multiple exist.
    const structureArea = container.querySelector(".bg-\\[\\#1e1535\\]");
    expect(structureArea).not.toBeNull();

    // The zone bar wrapper has a border-t separator
    const separators = structureArea!.querySelectorAll(".border-t");
    // At least one separator for the zone bar children slot
    expect(separators.length).toBeGreaterThanOrEqual(1);
  });

  it("renders HRMiniChart for a completed event with hrZones and streamData", () => {
    const { container } = render(
      <EventModal
        event={baseCompleted}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        apiKey="test"
      />,
    );

    // HRMiniChart with hrData renders a flex container with gap-px and individual bars
    const miniCharts = container.querySelectorAll(".gap-px");
    expect(miniCharts.length).toBeGreaterThanOrEqual(1);

    // Each bar has a backgroundColor matching HR zone color
    const chart = miniCharts[0];
    const bars = chart.querySelectorAll("div[style]");
    expect(bars.length).toBeGreaterThan(0);
  });

  it("shows skeleton shimmer when loading stream data for completed event without hrZones", () => {
    const loading: CalendarEvent = {
      ...baseCompleted,
      hrZones: undefined,
      streamData: undefined,
    };

    const { container } = render(
      <EventModal
        event={loading}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        isLoadingStreamData
        apiKey="test"
      />,
    );

    const skeleton = container.querySelector(".skeleton");
    expect(skeleton).not.toBeNull();
  });

  it("renders no zone bar for completed event without hrZones and not loading", () => {
    const noZones: CalendarEvent = {
      ...baseCompleted,
      hrZones: undefined,
      streamData: undefined,
    };

    const { container } = render(
      <EventModal
        event={noZones}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}
        isLoadingStreamData={false}
        apiKey="test"
      />,
    );

    // No skeleton, no mini chart
    expect(container.querySelector(".skeleton")).toBeNull();
    expect(container.querySelector(".gap-px")).toBeNull();
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
