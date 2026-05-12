import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { TomorrowCard } from "../TomorrowCard";
import type { PredictorName } from "@/lib/intelScreenData";

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
      p10PeakBG: 6.3,
      p90PeakBG: 11.6,
      lateHypoCount: 1,
      bigReboundCount: 8,
      matchCount: 11,
    },
  },
  matches: [
    { activityId: "x1", date: "2026-04-30", startBG: 8.6, endBG: 4.8, fuelRate: 60 },
    { activityId: "x2", date: "2026-04-23", startBG: 11.7, endBG: 9.1, fuelRate: 60 },
  ],
  matchPredictors: ["fuelRate"] as PredictorName[],
  matchRelaxed: false,
};

describe("TomorrowCard", () => {
  it("renders workout name, recommended fuel, predicted end BG range", () => {
    render(<TomorrowCard {...sample} />);
    expect(screen.getByText(/W14 Long Intervals/)).toBeInTheDocument();
    expect(screen.getAllByText(/60/).length).toBeGreaterThan(0);
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
    render(
      <TomorrowCard
        {...sample}
        prediction={null}
        recommendation={null}
        matches={[]}
        matchPredictors={[]}
        matchRelaxed={false}
      />,
    );
    expect(screen.getAllByText(/no matching history yet/i).length).toBeGreaterThan(0);
  });

  it("labels the fuel chip with the per-rate subset count, not the overall total", () => {
    render(<TomorrowCard {...sample} />);
    // Sample has matchCountAtRate=8, fuelRate=60 — meta should mention the per-rate subset.
    expect(screen.getByText(/8 runs at 60 g\/h/i)).toBeInTheDocument();
  });

  it("surfaces the gap when more matches exist than have post-run data", () => {
    render(
      <TomorrowCard
        {...sample}
        matches={[
          ...sample.matches,
          { activityId: "x3", date: "2026-04-20", startBG: 9, endBG: 6, fuelRate: 60 },
          { activityId: "x4", date: "2026-04-19", startBG: 8, endBG: 5, fuelRate: 60 },
          { activityId: "x5", date: "2026-04-18", startBG: 7, endBG: 4, fuelRate: 60 },
          { activityId: "x6", date: "2026-04-17", startBG: 8, endBG: 5, fuelRate: 60 },
          { activityId: "x7", date: "2026-04-16", startBG: 8, endBG: 5, fuelRate: 60 },
          { activityId: "x8", date: "2026-04-15", startBG: 8, endBG: 5, fuelRate: 60 },
          { activityId: "x9", date: "2026-04-14", startBG: 8, endBG: 5, fuelRate: 60 },
        ]}
      />,
    );
    // 9 matches total, 8 have post-run data — gap label should appear.
    expect(screen.getByText(/Showing 9 matches; 8 have post-run data/i)).toBeInTheDocument();
  });

  it("renders prediction without fuel rec when recommendation is null", () => {
    render(<TomorrowCard {...sample} recommendation={null} />);
    expect(screen.getByText(/no fuel rate recorded for these matches/i)).toBeInTheDocument();
    expect(screen.getByText(/8 runs without fuel data/i)).toBeInTheDocument();
    // Prediction blocks should still be visible.
    expect(screen.getAllByText(/5\.8/).length).toBeGreaterThan(0); // median end BG
    expect(screen.getByText(/2 of 8/i)).toBeInTheDocument(); // hypo count
    expect(screen.getByRole("button", { name: /matching runs/i })).toBeInTheDocument();
    expect(screen.getAllByText(/\+3\.0/).length).toBeGreaterThan(0); // rebound
  });

  it("shows matching predictor explainer when predictors are used", () => {
    render(
      <TomorrowCard {...sample} matchPredictors={["fuelRate", "timeOfDay"]} matchRelaxed={false} />,
    );
    expect(screen.getByText(/Matched on similar fuel rate and time of day/i)).toBeInTheDocument();
  });

  it("shows relaxed filter label when matchRelaxed is true", () => {
    render(<TomorrowCard {...sample} matchPredictors={[]} matchRelaxed={true} />);
    expect(
      screen.getByText(/Matched on category only — relaxed soft filters to find enough runs/i),
    ).toBeInTheDocument();
  });

  it("shows nothing when no predictors are used and match is not relaxed", () => {
    render(<TomorrowCard {...sample} matchPredictors={[]} matchRelaxed={false} />);
    expect(screen.queryByText(/Matched on/i)).not.toBeInTheDocument();
  });

  it("ribbon label names the typical category and recommended fuel rate", () => {
    render(<TomorrowCard {...sample} />);
    expect(
      screen.getByText(/Predicted end BG · typical Interval \/ Club at 60 g\/h/i),
    ).toBeInTheDocument();
  });

  it("ribbon label drops the fuel-rate suffix when no recommendation exists", () => {
    render(<TomorrowCard {...sample} recommendation={null} />);
    expect(
      screen.getByText(/Predicted end BG · typical Interval \/ Club$/i),
    ).toBeInTheDocument();
  });

  it("does not render any 'current BG' or 'starting at' framing", () => {
    render(<TomorrowCard {...sample} />);
    expect(screen.queryByText(/current BG/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/starting at/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no live BG/i)).not.toBeInTheDocument();
  });

  it("labels the ribbon endpoints with low/typical/high", () => {
    render(<TomorrowCard {...sample} />);
    // Both during and after ribbons render these three labels — multiple matches expected.
    expect(screen.getAllByText(/low/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/typical/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/high/i).length).toBeGreaterThan(0);
  });

  it("AFTER ribbon labels low value as muted and high value as error", () => {
    render(<TomorrowCard {...sample} />);
    const low = screen.getByTestId("ribbon-after-low");
    const high = screen.getByTestId("ribbon-after-high");
    expect(low).toHaveClass("text-muted");
    expect(low).not.toHaveClass("text-error");
    expect(high).toHaveClass("text-error");
    expect(high).not.toHaveClass("text-muted");
  });

  it("DURING ribbon keeps low value as error and high value as muted", () => {
    render(<TomorrowCard {...sample} />);
    expect(screen.getByTestId("ribbon-during-low")).toHaveClass("text-error");
    expect(screen.getByTestId("ribbon-during-high")).toHaveClass("text-muted");
  });
});
