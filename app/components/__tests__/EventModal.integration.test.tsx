import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  name: "W02 Tue Hills eco16",
  description: HILLS_DESCRIPTION,
  type: "planned",
  category: "interval",
  fuelRate: 30,
  totalCarbs: 25,
};

const baseCompleted: CalendarEvent = {
  id: "e200",
  date: new Date("2026-03-08T10:00:00"),
  name: "W02 Sun Long (10km) eco16",
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
