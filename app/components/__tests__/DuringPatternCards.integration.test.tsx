import { render, screen, within, waitFor } from "@/lib/__tests__/test-utils";
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DuringPatternCards } from "../DuringPatternCards";

const mkBGs = (vals: number[]) =>
  vals.map((bg, i) => ({
    bg,
    date: `2026-04-${String((i % 28) + 1).padStart(2, "0")}`,
    activityId: `act-${i}`,
  }));

const sampleStats = {
  easy: {
    runCount: 38,
    medianEndBG: 7.8,
    endBGs: mkBGs([3.8, 5, 6, 7, 8, 9, 10, 12, 14]),
    hypoCount: 1,
    avgDropPerHr: -2.5,
  },
  long: {
    runCount: 13,
    medianEndBG: 7.5,
    endBGs: mkBGs([6.1, 7, 8, 11, 13.6]),
    hypoCount: 0,
    avgDropPerHr: -1.5,
  },
  interval: {
    runCount: 15,
    medianEndBG: 7.8,
    endBGs: mkBGs([3.9, 4.6, 5.8, 8.7, 11.7]),
    hypoCount: 2,
    avgDropPerHr: -2.7,
  },
};

describe("DuringPatternCards", () => {
  it("orders cards by hypo rate descending — interval first", () => {
    render(<DuringPatternCards stats={sampleStats} />);
    const headings = screen.getAllByTestId("during-card-name");
    expect(headings[0].textContent).toMatch(/interval/i);
    expect(headings[1].textContent).toMatch(/easy/i);
    expect(headings[2].textContent).toMatch(/long/i);
  });

  it("shows median end BG, hypo count, and drop per hour for each category", () => {
    render(<DuringPatternCards stats={sampleStats} />);
    const intervalCard = screen.getByTestId("during-card-interval");
    expect(within(intervalCard).getByText(/7\.8/)).toBeInTheDocument();
    expect(within(intervalCard).getByText(/2 of 15/)).toBeInTheDocument();
    expect(within(intervalCard).getByText(/-2\.7/)).toBeInTheDocument();
  });

  it("does not show any 'mmol/L /min' text", () => {
    const { container } = render(<DuringPatternCards stats={sampleStats} />);
    expect(container.textContent).not.toMatch(/mmol\/L\s*\/\s*min/);
  });

  it("renders only categories with non-null stats", () => {
    render(
      <DuringPatternCards stats={{ ...sampleStats, long: null }} />,
    );
    const headings = screen.getAllByTestId("during-card-name");
    expect(headings.length).toBe(2);
  });

  it("renders hypo and high zone labels under each dot strip", () => {
    render(<DuringPatternCards stats={sampleStats} />);
    // Three category cards rendered → expect three of each zone label.
    expect(screen.getAllByText(/hypo <4\.0/i).length).toBe(3);
    expect(screen.getAllByText(/high >10\.0/i).length).toBe(3);
  });

  it("shows a tooltip with date and value when a dot is hovered", async () => {
    const user = userEvent.setup();
    render(<DuringPatternCards stats={sampleStats} />);
    const intervalCard = screen.getByTestId("during-card-interval");
    expect(within(intervalCard).queryByTestId("dot-tooltip")).not.toBeInTheDocument();
    // Interval fixture's first dot: bg=3.9, date="2026-04-01" → "Apr 1 · 3.9 mmol/L".
    const firstDot = within(intervalCard).getAllByRole("button")[0];
    await user.hover(firstDot);
    const tooltip = within(intervalCard).getByTestId("dot-tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toMatch(/Apr 1.*3\.9 mmol\/L/);
  });

  it("hides the tooltip after the focused dot blurs (with grace period)", async () => {
    const user = userEvent.setup();
    render(<DuringPatternCards stats={sampleStats} />);
    const intervalCard = screen.getByTestId("during-card-interval");
    const firstDot = within(intervalCard).getAllByRole("button")[0];
    await user.click(firstDot);
    expect(within(intervalCard).getByTestId("dot-tooltip")).toBeInTheDocument();
    // Click outside to blur the dot. Close runs ~100ms later — wait for it.
    await user.click(document.body);
    await waitFor(() => {
      expect(within(intervalCard).queryByTestId("dot-tooltip")).not.toBeInTheDocument();
    });
  });

  it("clicking the tooltip fires onActivitySelect with the dot's activityId", async () => {
    const user = userEvent.setup();
    const onActivitySelect = vi.fn();
    render(<DuringPatternCards stats={sampleStats} onActivitySelect={onActivitySelect} />);
    const intervalCard = screen.getByTestId("during-card-interval");
    // Interval fixture's first dot: activityId="act-0".
    const firstDot = within(intervalCard).getAllByRole("button")[0];
    await user.hover(firstDot);
    const tooltip = within(intervalCard).getByTestId("dot-tooltip");
    await user.click(tooltip);
    expect(onActivitySelect).toHaveBeenCalledWith("act-0");
  });

  it("renders a dot at the minimum BG inside the strip (no overflow)", () => {
    // bg=3.5 is the strip's MIN. Without clamping, the dot's center sits at
    // left:0% and -translate-x-1/2 pushes half outside. With the clamp the
    // displayed left percent is at least DOT_HALF_PCT (1.5%).
    const stats = {
      easy: {
        runCount: 1,
        medianEndBG: 3.5,
        endBGs: mkBGs([3.5]),
        hypoCount: 1,
        avgDropPerHr: 0,
      },
      long: null,
      interval: null,
    };
    render(<DuringPatternCards stats={stats} />);
    const easyCard = screen.getByTestId("during-card-easy");
    const dot = within(easyCard).getAllByRole("button")[0];
    const left = parseFloat(dot.style.left);
    expect(left).toBeGreaterThanOrEqual(1.5);
    // And a max-value dot stays inside the right edge.
    const stats2 = {
      easy: {
        runCount: 1,
        medianEndBG: 14,
        endBGs: mkBGs([14]),
        hypoCount: 0,
        avgDropPerHr: 0,
      },
      long: null,
      interval: null,
    };
    const { unmount } = render(<DuringPatternCards stats={stats2} />);
    const easyCard2 = screen.getAllByTestId("during-card-easy")[1];
    const dot2 = within(easyCard2).getAllByRole("button")[0];
    expect(parseFloat(dot2.style.left)).toBeLessThanOrEqual(98.5);
    unmount();
  });
});
