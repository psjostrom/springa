import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PacePBs } from "../PacePBs";
import type { BestEffort } from "@/lib/types";

const bestEfforts: BestEffort[] = [
  { distance: 1000, label: "1K Best", timeSeconds: 292, pace: 4.87, activityId: "a1" },
  { distance: 5000, label: "5K Best", timeSeconds: 1650, pace: 5.5, activityId: "a2" },
];

const longestRun = { distance: 16000, activityId: "a3", activityName: "Sunday Long" };

describe("PacePBs", () => {
  it("renders effort cards with times", () => {
    render(<PacePBs bestEfforts={bestEfforts} longestRun={longestRun} />);
    expect(screen.getByText("1K Best")).toBeInTheDocument();
    expect(screen.getByText("5K Best")).toBeInTheDocument();
    expect(screen.getByText("Longest Run")).toBeInTheDocument();
    expect(screen.getByText("16km")).toBeInTheDocument();
  });

  it("calls onActivitySelect when a card is tapped", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PacePBs bestEfforts={bestEfforts} longestRun={longestRun} onActivitySelect={onSelect} />);
    await user.click(screen.getByText("1K Best"));
    expect(onSelect).toHaveBeenCalledWith("a1");
  });

  it("returns null when no efforts and no longest run", () => {
    const { container } = render(<PacePBs bestEfforts={[]} longestRun={null} />);
    expect(container.firstChild).toBeNull();
  });
});
