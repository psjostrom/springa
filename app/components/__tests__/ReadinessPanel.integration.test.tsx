import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import type { WellnessEntry } from "@/lib/intervalsApi";
import { ReadinessPanel } from "../ReadinessPanel";
import "@/lib/__tests__/setup-dom";

function makeWellnessEntry(
  daysAgo: number,
  overrides: Partial<WellnessEntry> = {}
): WellnessEntry {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const id = date.toISOString().slice(0, 10);
  return {
    id,
    ...overrides,
  };
}

function make28DayBaseline(
  hrvMean = 50,
  rhrMean = 55,
  sleepScore = 75
): WellnessEntry[] {
  return Array.from({ length: 28 }, (_, i) => {
    // Add some variation around the mean
    const variation = (i % 5) - 2; // -2 to +2
    return makeWellnessEntry(i + 1, {
      hrv: hrvMean + variation * 2,
      restingHR: rhrMean + variation,
      sleepScore: sleepScore + variation * 3,
      ctl: 40,
      atl: 35,
    });
  });
}

describe("ReadinessPanel", () => {
  it("shows empty state when no entries", () => {
    render(<ReadinessPanel entries={[]} />);
    expect(screen.getByText("No wellness data available")).toBeInTheDocument();
  });

  it("shows empty state when latest entry has no metrics", () => {
    const entries = [makeWellnessEntry(0, {})];
    render(<ReadinessPanel entries={entries} />);
    expect(screen.getByText("No wellness data for today")).toBeInTheDocument();
  });

  it("uses built-in readiness when available", () => {
    const entries = [
      makeWellnessEntry(0, {
        readiness: 85,
        hrv: 55,
        restingHR: 52,
        sleepScore: 80,
      }),
    ];
    render(<ReadinessPanel entries={entries} />);

    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("Ready to train")).toBeInTheDocument();
    expect(screen.getByText("From wearable")).toBeInTheDocument();
  });

  it("computes readiness when built-in not available", () => {
    const baseline = make28DayBaseline(50, 55, 75);
    // Latest entry with average metrics
    const latest = makeWellnessEntry(0, {
      hrv: 50, // At average
      restingHR: 55, // At average
      sleepScore: 60, // Below average
      ctl: 45,
      atl: 55, // TSB = -10 (loading)
    });

    render(<ReadinessPanel entries={[...baseline, latest]} />);

    expect(screen.getByText("Based on HRV, HR, sleep, form")).toBeInTheDocument();
    // With average/below-average metrics, should show moderate readiness
    expect(screen.getByText("Good to go")).toBeInTheDocument();
  });

  it("shows Ready to train for high readiness", () => {
    const entries = [makeWellnessEntry(0, { readiness: 75 })];
    render(<ReadinessPanel entries={entries} />);
    expect(screen.getByText("Ready to train")).toBeInTheDocument();
  });

  it("shows Good to go for moderate-high readiness", () => {
    const entries = [makeWellnessEntry(0, { readiness: 55 })];
    render(<ReadinessPanel entries={entries} />);
    expect(screen.getByText("Good to go")).toBeInTheDocument();
  });

  it("shows Monitor recovery for moderate-low readiness", () => {
    const entries = [makeWellnessEntry(0, { readiness: 35 })];
    render(<ReadinessPanel entries={entries} />);
    expect(screen.getByText("Monitor recovery")).toBeInTheDocument();
  });

  it("shows Recovery day for low readiness", () => {
    const entries = [makeWellnessEntry(0, { readiness: 25 })];
    render(<ReadinessPanel entries={entries} />);
    expect(screen.getByText("Recovery day")).toBeInTheDocument();
  });

  it("displays HRV metric card", () => {
    const entries = [makeWellnessEntry(0, { hrv: 52 })];
    render(<ReadinessPanel entries={entries} />);

    expect(screen.getByText("HRV")).toBeInTheDocument();
    expect(screen.getByText("52")).toBeInTheDocument();
    expect(screen.getByText("ms")).toBeInTheDocument();
  });

  it("displays Resting HR metric card", () => {
    const entries = [makeWellnessEntry(0, { restingHR: 54 })];
    render(<ReadinessPanel entries={entries} />);

    expect(screen.getByText("Resting HR")).toBeInTheDocument();
    expect(screen.getByText("54")).toBeInTheDocument();
    expect(screen.getByText("bpm")).toBeInTheDocument();
  });

  it("displays Sleep Score when sleepScore > 12", () => {
    // Sleep score 83 appears twice: once as the metric, once as computed readiness
    // (since sleep is the only metric, readiness equals sleep score)
    const entries = [makeWellnessEntry(0, { sleepScore: 83 })];
    render(<ReadinessPanel entries={entries} />);

    expect(screen.getByText("Sleep Score")).toBeInTheDocument();
    // Two "83" elements: readiness banner and sleep metric card
    const elements = screen.getAllByText("83");
    expect(elements).toHaveLength(2);
  });

  it("displays Sleep hours when sleepSecs provided", () => {
    const entries = [makeWellnessEntry(0, { sleepSecs: 7 * 3600 })]; // 7 hours
    render(<ReadinessPanel entries={entries} />);

    expect(screen.getByText("Sleep")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("hrs")).toBeInTheDocument();
  });

  it("displays TSB gauge with Fatigued label for very negative TSB", () => {
    const entries = [makeWellnessEntry(0, { ctl: 50, atl: 75 })]; // TSB = -25
    render(<ReadinessPanel entries={entries} />);

    expect(screen.getByText("Form (TSB)")).toBeInTheDocument();
    expect(screen.getByText("-25")).toBeInTheDocument();
    expect(screen.getByText("Fatigued")).toBeInTheDocument();
  });

  it("displays TSB gauge with Loading label for moderately negative TSB", () => {
    const entries = [makeWellnessEntry(0, { ctl: 50, atl: 65 })]; // TSB = -15
    render(<ReadinessPanel entries={entries} />);

    expect(screen.getByText("-15")).toBeInTheDocument();
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("displays TSB gauge with Neutral label for TSB around zero", () => {
    const entries = [makeWellnessEntry(0, { ctl: 50, atl: 50 })]; // TSB = 0
    render(<ReadinessPanel entries={entries} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Neutral")).toBeInTheDocument();
  });

  it("displays TSB gauge with Fresh label for positive TSB", () => {
    const entries = [makeWellnessEntry(0, { ctl: 50, atl: 40 })]; // TSB = +10
    render(<ReadinessPanel entries={entries} />);

    expect(screen.getByText("+10")).toBeInTheDocument();
    expect(screen.getByText("Fresh")).toBeInTheDocument();
  });

  it("displays TSB gauge with Peaked label for high positive TSB", () => {
    const entries = [makeWellnessEntry(0, { ctl: 50, atl: 30 })]; // TSB = +20
    render(<ReadinessPanel entries={entries} />);

    expect(screen.getByText("+20")).toBeInTheDocument();
    expect(screen.getByText("Peaked")).toBeInTheDocument();
  });

  it("renders sparklines when historical data available", () => {
    const entries = Array.from({ length: 14 }, (_, i) =>
      makeWellnessEntry(i, {
        hrv: 45 + i,
        restingHR: 58 - i / 2,
        sleepScore: 70 + i,
      })
    );
    render(<ReadinessPanel entries={entries} />);

    // SVG elements should be present (sparklines)
    const svgs = document.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("sorts entries by date and uses latest", () => {
    // Entries in random order
    const entries = [
      makeWellnessEntry(2, { hrv: 40, restingHR: 60 }),
      makeWellnessEntry(0, { hrv: 55, restingHR: 52 }), // Latest - should be used
      makeWellnessEntry(1, { hrv: 45, restingHR: 58 }),
    ];
    render(<ReadinessPanel entries={entries} />);

    // Should show latest entry's values
    expect(screen.getByText("55")).toBeInTheDocument(); // HRV
    expect(screen.getByText("52")).toBeInTheDocument(); // RHR
  });
});
