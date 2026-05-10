import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { TomorrowCard } from "../TomorrowCard";

const sample = {
  workout: {
    name: "W14 Long Intervals — 4×6min",
    date: "2026-05-11",
    timeOfDay: "06:30",
    category: "interval" as const,
    durationMin: 50,
    distanceKm: 7,
    targetHRRange: "152-158 bpm",
  },
  currentBG: 8.5,
  recommendation: {
    fuelRate: 60,
    basis: "evidence" as const,
    predictedP10EndBG: 4.4,
    matchCountAtRate: 8,
  },
  prediction: {
    during: {
      medianEndBG: 5.8,
      p10EndBG: 4.4,
      p90EndBG: 6.6,
      hypoCount: 2,
      matchCount: 8,
      confidence: "medium" as const,
    },
    after: {
      medianRebound: 3.0,
      p10Rebound: 0.5,
      p90Rebound: 5.8,
      medianPeakBG: 8.8,
      lateHypoCount: 1,
      bigReboundCount: 8,
      matchCount: 11,
    },
  },
  matches: [
    { activityId: "x1", date: "2026-04-30", startBG: 8.6, endBG: 4.8, fuelRate: 60 },
    { activityId: "x2", date: "2026-04-23", startBG: 11.7, endBG: 9.1, fuelRate: 60 },
  ],
};

describe("TomorrowCard", () => {
  it("renders workout name, recommended fuel, predicted end BG range", () => {
    render(<TomorrowCard {...sample} />);
    expect(screen.getByText(/W14 Long Intervals/)).toBeInTheDocument();
    expect(screen.getByText(/60/)).toBeInTheDocument();
    expect(screen.getAllByText(/5\.8/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4\.4/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/6\.6/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 of 8/i)).toBeInTheDocument();
  });

  it("toggles matching runs list", async () => {
    render(<TomorrowCard {...sample} />);
    expect(screen.queryByText(/Apr 30/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /matching runs/i }));
    expect(screen.getByText(/Apr 30/)).toBeInTheDocument();
  });

  it("shows after-section rebound prediction with levers", () => {
    render(<TomorrowCard {...sample} />);
    expect(screen.getAllByText(/\+3\.0/).length).toBeGreaterThan(0);
    expect(screen.getByText(/8 of 11/)).toBeInTheDocument();
    expect(screen.getByText(/reconnect pump/i)).toBeInTheDocument();
  });

  it("shows 'no matching history yet' when prediction is null", () => {
    render(<TomorrowCard {...sample} prediction={null} recommendation={null} matches={[]} />);
    expect(screen.getAllByText(/no matching history yet/i).length).toBeGreaterThan(0);
  });
});
