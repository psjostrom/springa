import { render, screen, within } from "@/lib/__tests__/test-utils";
import { describe, it, expect } from "vitest";
import type { WorkoutCategory } from "@/lib/types";
import { AfterPatternCards } from "../AfterPatternCards";
import type { AfterStats } from "../AfterPatternCards";

const stats = {
  easy: { runCount: 35, medianRebound: 2.3, bigReboundCount: 21, lateHypoCount: 1 },
  long: { runCount: 9, medianRebound: 4.0, bigReboundCount: 8, lateHypoCount: 1 },
  interval: { runCount: 11, medianRebound: 3.0, bigReboundCount: 8, lateHypoCount: 1 },
};

describe("AfterPatternCards", () => {
  it("orders by big-rebound rate descending — long first", () => {
    render(<AfterPatternCards stats={stats} />);
    const cards = screen.getAllByTestId(/^after-card-/);
    expect(cards[0]).toHaveAttribute("data-testid", "after-card-long");
  });

  it("renders the rebound → bolus → late hypo chain numbers", () => {
    render(<AfterPatternCards stats={stats} />);
    const longCard = screen.getByTestId("after-card-long");
    expect(within(longCard).getByText("8/9 rebound")).toBeInTheDocument();
    expect(within(longCard).getByText("1/9 late hypo")).toBeInTheDocument();
    expect(within(longCard).getAllByText("bolus").length).toBeGreaterThan(0);
  });

  it("shows lever line on the dominant (first) card only", () => {
    render(<AfterPatternCards stats={stats} />);
    const longCard = screen.getByTestId("after-card-long");
    expect(within(longCard).getByText(/Lever:/i)).toBeInTheDocument();
    const easyCard = screen.getByTestId("after-card-easy");
    expect(within(easyCard).queryByText(/Lever:/i)).not.toBeInTheDocument();
  });

  it("filters out null categories", () => {
    render(
      <AfterPatternCards stats={{ easy: null, long: stats.long, interval: stats.interval } as Record<WorkoutCategory, AfterStats | null>} />,
    );
    const cards = screen.getAllByTestId(/^after-card-/);
    expect(cards.length).toBe(2);
  });
});
