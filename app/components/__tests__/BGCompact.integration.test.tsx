import { describe, it, expect } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import { BGCompact } from "../BGCompact";
import type { CategoryBGResponse } from "@/lib/bgModel";

const categories: CategoryBGResponse[] = [
  { category: "easy", avgRate: -0.4, medianRate: -0.3, sampleCount: 30, activityCount: 8, maxDurationMin: 45, avgFuelRate: 48, confidence: "high" },
  { category: "long", avgRate: -1.2, medianRate: -1.1, sampleCount: 15, activityCount: 4, maxDurationMin: 75, avgFuelRate: 60, confidence: "medium" },
  { category: "interval", avgRate: -0.8, medianRate: -0.7, sampleCount: 10, activityCount: 3, maxDurationMin: 40, avgFuelRate: 30, confidence: "low" },
];

describe("BGCompact", () => {
  it("renders all three categories with rates", () => {
    render(<BGCompact categories={categories} />);
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(screen.getByText("Long")).toBeInTheDocument();
    expect(screen.getByText("Interval")).toBeInTheDocument();
    expect(screen.getByText("-0.4")).toBeInTheDocument();
    expect(screen.getByText("-1.2")).toBeInTheDocument();
    expect(screen.getByText("-0.8")).toBeInTheDocument();
  });

  it("shows rate labels", () => {
    render(<BGCompact categories={categories} />);
    expect(screen.getByText("Stable")).toBeInTheDocument();
    const moderateLabels = screen.getAllByText("Moderate");
    expect(moderateLabels).toHaveLength(2);
  });

  it("shows Fast drop label for rates below -1.5", () => {
    const fastDrop: CategoryBGResponse[] = [
      { category: "long", avgRate: -2.0, medianRate: -1.8, sampleCount: 10, activityCount: 3, maxDurationMin: 60, avgFuelRate: 60, confidence: "medium" },
    ];
    render(<BGCompact categories={fastDrop} />);
    expect(screen.getByText("Fast drop")).toBeInTheDocument();
    expect(screen.getByText("-2.0")).toBeInTheDocument();
  });

  it("returns null when no categories", () => {
    const { container } = render(<BGCompact categories={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
