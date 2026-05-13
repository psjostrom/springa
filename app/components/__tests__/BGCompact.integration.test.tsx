import { describe, it, expect } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import { BGCompact } from "../BGCompact";
import type { CategoryBGResponse } from "@/lib/bgModel";

// Fixtures use realistic per-minute rates — display converts × 60 to mmol/hr.
// easy median -0.01 → -0.6 mmol/hr (Stable, > -1)
// long median -0.04 → -2.4 mmol/hr (Moderate, -3 < x ≤ -1)
// interval median -0.025 → -1.5 mmol/hr (Moderate)
const categories: CategoryBGResponse[] = [
  { category: "easy", avgRate: -0.012, medianRate: -0.01, sampleCount: 30, activityCount: 8, maxDurationMin: 45, avgFuelRate: 48, confidence: "high" },
  { category: "long", avgRate: -0.045, medianRate: -0.04, sampleCount: 15, activityCount: 4, maxDurationMin: 75, avgFuelRate: 60, confidence: "medium" },
  { category: "interval", avgRate: -0.028, medianRate: -0.025, sampleCount: 10, activityCount: 3, maxDurationMin: 40, avgFuelRate: 30, confidence: "low" },
];

describe("BGCompact", () => {
  it("renders all three categories with rates in mmol/hr", () => {
    render(<BGCompact categories={categories} />);
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(screen.getByText("Long")).toBeInTheDocument();
    expect(screen.getByText("Interval")).toBeInTheDocument();
    expect(screen.getByText("-0.6")).toBeInTheDocument();
    expect(screen.getByText("-2.4")).toBeInTheDocument();
    expect(screen.getByText("-1.5")).toBeInTheDocument();
    expect(screen.getAllByText("mmol/hr").length).toBeGreaterThanOrEqual(3);
  });

  it("shows rate labels", () => {
    render(<BGCompact categories={categories} />);
    expect(screen.getByText("Stable")).toBeInTheDocument();
    const moderateLabels = screen.getAllByText("Moderate");
    expect(moderateLabels).toHaveLength(2);
  });

  it("shows Fast drop label for rates below -3 mmol/hr", () => {
    // medianRate -0.06 × 60 = -3.6 mmol/hr → Fast drop
    const fastDrop: CategoryBGResponse[] = [
      { category: "long", avgRate: -0.07, medianRate: -0.06, sampleCount: 10, activityCount: 3, maxDurationMin: 60, avgFuelRate: 60, confidence: "medium" },
    ];
    render(<BGCompact categories={fastDrop} />);
    expect(screen.getByText("Fast drop")).toBeInTheDocument();
    expect(screen.getByText("-3.6")).toBeInTheDocument();
  });

  it("returns null when no categories", () => {
    const { container } = render(<BGCompact categories={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
