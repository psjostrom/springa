import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import type { BGResponseModel } from "@/lib/bgModel";
import { SimulateScreen } from "../SimulateScreen";
import { bgModelAtom, bgModelLoadingAtom } from "../../atoms";
import "@/lib/__tests__/setup-dom";

function makeBGModel(overrides?: Partial<BGResponseModel>): BGResponseModel {
  return {
    activitiesAnalyzed: 10,
    categories: {
      easy: { category: "easy", avgRate: -0.02, medianRate: -0.02, sampleCount: 30, confidence: "medium", avgFuelRate: 45, activityCount: 10, maxDurationMin: 50 },
      long: { category: "long", avgRate: -0.04, medianRate: -0.04, sampleCount: 15, confidence: "medium", avgFuelRate: 58, activityCount: 5, maxDurationMin: 90 },
      interval: { category: "interval", avgRate: -0.06, medianRate: -0.06, sampleCount: 10, confidence: "low", avgFuelRate: 30, activityCount: 4, maxDurationMin: 40 },
    },
    observations: [],
    bgByStartLevel: [],
    bgByEntrySlope: [],
    bgByTime: [],
    targetFuelRates: [
      { category: "easy", targetFuelRate: 47, currentAvgFuel: 45, method: "extrapolation", confidence: "medium", spikeAdjustment: null },
      { category: "long", targetFuelRate: 63, currentAvgFuel: 58, method: "extrapolation", confidence: "high", spikeAdjustment: null },
    ],
    ...overrides,
  };
}

describe("SimulateScreen", () => {
  it("shows loading state while BG model loads", () => {
    render(<SimulateScreen />, {
      atomInits: [[bgModelLoadingAtom, true]],
    });

    expect(screen.getByText(/Loading BG model/)).toBeInTheDocument();
  });

  it("shows empty state when no BG data", () => {
    render(<SimulateScreen />, {
      atomInits: [
        [bgModelLoadingAtom, false],
        [bgModelAtom, { ...makeBGModel(), activitiesAnalyzed: 0 }],
      ],
    });

    expect(screen.getByText(/Complete a few runs with CGM data to unlock BG simulation/)).toBeInTheDocument();
  });

  it("initializes fuel rate from model target (snapped to step grid)", () => {
    // Model target for easy is 47 → snapped to 48
    render(<SimulateScreen />, {
      atomInits: [
        [bgModelLoadingAtom, false],
        [bgModelAtom, makeBGModel()],
      ],
    });

    expect(screen.getByText("48 g/h")).toBeInTheDocument();
  });

  it("shows confidence badge from model target", () => {
    render(<SimulateScreen />, {
      atomInits: [
        [bgModelLoadingAtom, false],
        [bgModelAtom, makeBGModel()],
      ],
    });

    // Easy has "medium" confidence
    expect(screen.getByText("medium")).toBeInTheDocument();
  });

  it("resets fuel rate to model default when switching category", async () => {
    const user = userEvent.setup();

    render(<SimulateScreen />, {
      atomInits: [
        [bgModelLoadingAtom, false],
        [bgModelAtom, makeBGModel()],
      ],
    });

    // Starts on Easy with 48 g/h (snapped from 47)
    expect(screen.getByText("48 g/h")).toBeInTheDocument();

    // Switch to Long — model target is 63 → snapped to 64
    await user.click(screen.getByRole("button", { name: "Long" }));
    expect(screen.getByText("64 g/h")).toBeInTheDocument();

    // Confidence should update to "high" (Long's target confidence)
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("keeps user override until category switch", async () => {
    const user = userEvent.setup();

    render(<SimulateScreen />, {
      atomInits: [
        [bgModelLoadingAtom, false],
        [bgModelAtom, makeBGModel()],
      ],
    });

    // Override fuel rate via slider
    const fuelSlider = screen.getByRole("slider", { name: /Fuel rate/i });
    fireEvent.change(fuelSlider, { target: { value: "32" } });

    expect(screen.getByText("32 g/h")).toBeInTheDocument();

    // Switch category — should reset to model default
    await user.click(screen.getByRole("button", { name: "Long" }));
    expect(screen.getByText("64 g/h")).toBeInTheDocument();
  });

  it("shows no confidence badge when category has no model target", async () => {
    const user = userEvent.setup();

    render(<SimulateScreen />, {
      atomInits: [
        [bgModelLoadingAtom, false],
        [bgModelAtom, makeBGModel()],
      ],
    });

    // Switch to Interval — no target in targetFuelRates
    await user.click(screen.getByRole("button", { name: "Interval" }));

    // Should show avgFuelRate (30) snapped to 32
    expect(screen.getByText("32 g/h")).toBeInTheDocument();

    // No confidence badge
    expect(screen.queryByText("high")).not.toBeInTheDocument();
    expect(screen.queryByText("medium")).not.toBeInTheDocument();
    expect(screen.queryByText("low")).not.toBeInTheDocument();
  });

  it("falls back to default 60 when no model data for category", () => {
    render(<SimulateScreen />, {
      atomInits: [
        [bgModelLoadingAtom, false],
        [bgModelAtom, makeBGModel({
          categories: {
            easy: null,
            long: null,
            interval: null,
          },
          targetFuelRates: [],
        })],
      ],
    });

    // Default fuel rate is 60, which is already on the 4-step grid
    expect(screen.getByText("60 g/h")).toBeInTheDocument();
  });

  it("renders simulation results with summary stats", () => {
    render(<SimulateScreen />, {
      atomInits: [
        [bgModelLoadingAtom, false],
        [bgModelAtom, makeBGModel()],
      ],
    });

    expect(screen.getByText("End BG")).toBeInTheDocument();
    expect(screen.getByText("Min BG")).toBeInTheDocument();
    expect(screen.getByText("Hypo risk")).toBeInTheDocument();
  });
});
