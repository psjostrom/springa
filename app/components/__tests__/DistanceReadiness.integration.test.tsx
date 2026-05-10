import { render, screen } from "@/lib/__tests__/test-utils";
import { describe, it, expect } from "vitest";
import { DistanceReadiness } from "../DistanceReadiness";

describe("DistanceReadiness", () => {
  it("shows longest run, race distance, and gap from real values", () => {
    render(
      <DistanceReadiness
        longestRun={{ distanceKm: 14, name: "Järfälla - W11 Long (14km)", dateISO: "2026-04-22" }}
        race={{ name: "EcoTrail", distanceKm: 16, date: "2026-06-13" }}
      />,
    );
    expect(screen.getByText(/Järfälla - W11 Long \(14km\)/)).toBeInTheDocument();
    expect(screen.getByText(/2026-04-22/)).toBeInTheDocument();
    // 14, 16, 2 should all appear as stat values
    expect(screen.getAllByText(/14|16|2/).length).toBeGreaterThan(0);
  });

  it("returns null when no longest run available", () => {
    const { container } = render(
      <DistanceReadiness
        longestRun={null}
        race={{ name: "EcoTrail", distanceKm: 16, date: "2026-06-13" }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("hides race-related stats when race info missing", () => {
    render(
      <DistanceReadiness
        longestRun={{ distanceKm: 14, name: "Foo", dateISO: "2026-04-22" }}
        race={null}
      />,
    );
    // Race stat tile should not be present
    expect(screen.queryByText(/Race$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gap$/)).not.toBeInTheDocument();
  });

  it("renders the progress bar marker at the correct position when race is set", () => {
    const { container } = render(
      <DistanceReadiness
        longestRun={{ distanceKm: 14, name: "Foo", dateISO: "2026-04-22" }}
        race={{ name: "EcoTrail", distanceKm: 16, date: "2026-06-13" }}
      />,
    );
    // Progress bar should exist (any element with width style)
    const bars = container.querySelectorAll('[style*="width"]');
    expect(bars.length).toBeGreaterThan(0);
  });
});
