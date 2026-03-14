import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VolumeCompact } from "../VolumeCompact";

describe("VolumeCompact", () => {
  it("renders actual vs target km with progress percentage", () => {
    render(
      <VolumeCompact
        actualKm={15}
        targetKm={25}
        completedRuns={3}
        totalRuns={4}
      />
    );
    expect(screen.getByText("15 km")).toBeInTheDocument();
    expect(screen.getByText(/25 km/)).toBeInTheDocument();
    expect(screen.getByText("3 of 4 runs")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60");
  });

  it("caps progress bar at 100%", () => {
    render(
      <VolumeCompact actualKm={30} targetKm={25} completedRuns={4} totalRuns={4} />
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});
