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
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
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

  it("shows both longest run and race text when race is set", () => {
    render(
      <DistanceReadiness
        longestRun={{ distanceKm: 14, name: "Foo", dateISO: "2026-04-22" }}
        race={{ name: "EcoTrail", distanceKm: 16, date: "2026-06-13" }}
      />,
    );
    expect(screen.getByText("Foo")).toBeInTheDocument();
    expect(screen.getByText(/EcoTrail/)).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
  });
});
