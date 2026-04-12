import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import type { UserSettings } from "@/lib/settings";
import { PlanTab } from "../PlanTab";
import "@/lib/__tests__/setup-dom";

const validSettings: UserSettings = {
  totalWeeks: 18,
  startKm: 8,
  includeBasePhase: false,
};

function renderTab(overrides: Partial<UserSettings> = {}) {
  // eslint-disable-next-line no-restricted-syntax -- callback spy, not a module mock
  const onSave = vi.fn<(partial: Partial<UserSettings>) => Promise<void>>().mockResolvedValue(undefined);
  const settings = { ...validSettings, ...overrides };
  render(<PlanTab settings={settings} onSave={onSave} />);
  return { onSave };
}

describe("PlanTab totalWeeks validation", () => {
  it("shows error when totalWeeks is below minimum", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTab({ totalWeeks: 18 });

    const weeksInput = screen.getByPlaceholderText("18");
    await user.clear(weeksInput);
    await user.type(weeksInput, "4");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText(/Total weeks must be at least/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Save is enabled when totalWeeks meets minimum", async () => {
    renderTab({ totalWeeks: 12 });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("calls onSave when totalWeeks is valid and changed", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTab({ totalWeeks: 18 });

    const weeksInput = screen.getByPlaceholderText("18");
    await user.clear(weeksInput);
    await user.type(weeksInput, "14");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ totalWeeks: 14 }),
    );
  });

  it("base phase toggle is disabled when totalWeeks is below 11", () => {
    renderTab({ totalWeeks: 10 });
    expect(screen.getByRole("switch", { name: /base phase/i })).toBeDisabled();
    expect(screen.getByText(/Requires at least 11 weeks/)).toBeInTheDocument();
  });

  it("base phase toggle is enabled when totalWeeks is 11 or more", () => {
    renderTab({ totalWeeks: 12 });
    expect(screen.getByRole("switch", { name: /base phase/i })).toBeEnabled();
  });

  it("forces includeBasePhase off when totalWeeks drops below 11", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTab({ totalWeeks: 12, includeBasePhase: true });

    // Reduce weeks to 10 — base toggle becomes disabled
    const weeksInput = screen.getByPlaceholderText("18");
    await user.clear(weeksInput);
    await user.type(weeksInput, "10");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Must save includeBasePhase: false to prevent getPhaseBoundaries(10, true) crash
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ totalWeeks: 10, includeBasePhase: false }),
    );
  });
});

describe("PlanTab warmth preference", () => {
  it("renders running temperature section", () => {
    renderTab();
    expect(screen.getByText("Running temperature")).toBeInTheDocument();
    expect(screen.getByText("Warmer")).toBeInTheDocument();
    expect(screen.getByText("Colder")).toBeInTheDocument();
  });

  it("has 5 warmth buttons", () => {
    renderTab();
    const buttons = screen.getAllByRole("button", { name: /Warmth/ });
    expect(buttons).toHaveLength(5);
  });

  it("saves warmth preference when changed", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTab({ warmthPreference: 0 });

    // Click the coldest option (warmth +2)
    const buttons = screen.getAllByRole("button", { name: /Warmth/ });
    await user.click(buttons[4]); // last button = +2 (colder)

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ warmthPreference: 2 }),
    );
  });

  it("does not include warmthPreference in save when unchanged", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTab({ warmthPreference: 0 });

    await user.click(screen.getByRole("button", { name: "Save" }));

    // No changes → no save call (or empty object)
    if (onSave.mock.calls.length > 0) {
      expect(onSave.mock.calls[0][0]).not.toHaveProperty("warmthPreference");
    }
  });

  it("shows reset button when preference is non-neutral", async () => {
    const user = userEvent.setup();
    renderTab({ warmthPreference: 0 });

    // Initially no reset button
    expect(screen.queryByText("Reset to neutral")).toBeNull();

    // Select a non-neutral option
    const buttons = screen.getAllByRole("button", { name: /Warmth/ });
    await user.click(buttons[0]); // warmest (-2)

    expect(screen.getByText("Reset to neutral")).toBeInTheDocument();
  });

  it("reset button returns to neutral", async () => {
    const user = userEvent.setup();
    renderTab({ warmthPreference: 1 });

    // Reset should be visible since preference is 1
    expect(screen.getByText("Reset to neutral")).toBeInTheDocument();

    await user.click(screen.getByText("Reset to neutral"));

    // Reset button should disappear
    expect(screen.queryByText("Reset to neutral")).toBeNull();
  });
});
