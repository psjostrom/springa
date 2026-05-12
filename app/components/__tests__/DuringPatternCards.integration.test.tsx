import { render, screen, within } from "@/lib/__tests__/test-utils";
import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { DuringPatternCards } from "../DuringPatternCards";

const mkBGs = (vals: number[]) =>
  vals.map((bg, i) => ({ bg, date: `2026-04-${String((i % 28) + 1).padStart(2, "0")}` }));

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
    expect(within(intervalCard).queryByRole("tooltip")).not.toBeInTheDocument();
    // Interval fixture's first dot: bg=3.9, date="2026-04-01" → "Apr 1 · 3.9 mmol/L".
    const firstDot = within(intervalCard).getAllByRole("button")[0];
    await user.hover(firstDot);
    const tooltip = within(intervalCard).getByRole("tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toMatch(/Apr 1.*3\.9 mmol\/L/);
  });

  it("hides the tooltip when the focused dot blurs", async () => {
    const user = userEvent.setup();
    render(<DuringPatternCards stats={sampleStats} />);
    const intervalCard = screen.getByTestId("during-card-interval");
    const firstDot = within(intervalCard).getAllByRole("button")[0];
    await user.click(firstDot);
    expect(within(intervalCard).getByRole("tooltip")).toBeInTheDocument();
    // Click outside to blur the button.
    await user.click(document.body);
    expect(within(intervalCard).queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
