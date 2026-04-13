import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import type { UserSettings } from "@/lib/settings";
import { TrainingTab } from "../TrainingTab";
import "@/lib/__tests__/setup-dom";

const validSettings: UserSettings = {
  totalWeeks: 18,
  startKm: 8,
};

function renderTab(overrides: Partial<UserSettings> = {}) {
  // eslint-disable-next-line no-restricted-syntax -- callback spy, not a module mock
  const onSave = vi.fn<(partial: Partial<UserSettings>) => Promise<void>>().mockResolvedValue(undefined);
  const settings = { ...validSettings, ...overrides };
  render(<TrainingTab settings={settings} onSave={onSave} />);
  return { onSave };
}

describe("TrainingTab training paces", () => {
  it("renders training paces section when ability is set", () => {
    renderTab({
      currentAbilityDist: 10,
      currentAbilitySecs: 3300,
      intervalsConnected: true,
    });

    expect(screen.getByText("Your fitness")).toBeInTheDocument();

    // There are two sets of distance buttons (fitness and goal), get all and check first set
    const allTenKButtons = screen.getAllByRole("button", { name: "10K" });
    expect(allTenKButtons[0]).toHaveClass("border-brand", "bg-brand/10", "text-brand");

    // PacePreview component renders pace preview with zone names
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(screen.getByText("Race Pace")).toBeInTheDocument();
    expect(screen.getByText("Interval")).toBeInTheDocument();
  });

  it("saves and pushes threshold pace to Intervals.icu when ability changes", async () => {
    const user = userEvent.setup();
    let capturedThresholdPayload: unknown = null;

    server.use(
      http.put("/api/intervals/threshold-pace", async ({ request }) => {
        capturedThresholdPayload = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );

    const { onSave } = renderTab({
      currentAbilityDist: 0, // Start with no ability set
      currentAbilitySecs: 0,
      intervalsConnected: true,
      sportSettingsId: 123,
    });

    // Select 10K ability
    const allTenKButtons = screen.getAllByRole("button", { name: "10K" });
    await user.click(allTenKButtons[0]); // Click the fitness 10K button

    // Click save - ability changed from 0 to 10, so it will save and sync
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Verify onSave was called with the new ability
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        currentAbilityDist: 10,
      }),
    );

    // Verify threshold pace was pushed to Intervals.icu
    await vi.waitFor(() => {
      expect(capturedThresholdPayload).not.toBeNull();
      expect(capturedThresholdPayload).toHaveProperty("paceMinPerKm");
    });
  });
});

describe("TrainingTab race goal", () => {
  it("sets race distance and date, then saves", async () => {
    const user = userEvent.setup();
    // eslint-disable-next-line no-restricted-syntax -- callback spy, not a module mock
    const onSave = vi.fn<(partial: Partial<UserSettings>) => Promise<void>>().mockResolvedValue(undefined);
    const settings = { ...validSettings, raceDist: 0, raceDate: "" };
    const { container } = render(<TrainingTab settings={settings} onSave={onSave} />);

    // Verify "Race goal" section exists
    expect(screen.getByText("Race goal")).toBeInTheDocument();

    // Select race distance (use the second set of buttons for race goal)
    const allHalfButtons = screen.getAllByRole("button", { name: "Half" });
    await user.click(allHalfButtons[1]); // Second set is for race goal

    // Set race date - find input by type attribute (date inputs don't expose a role)
    const dateInput = container.querySelector('input[type="date"]');
    if (!dateInput) throw new Error("Date input not found");
    await user.type(dateInput, "2026-06-13");

    // Save
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          raceDist: 21.0975,
          raceDate: "2026-06-13",
        }),
      );
    });
  });

  it("toggles race goal edit mode", async () => {
    const user = userEvent.setup();
    renderTab({
      raceDist: 21.0975,
      raceDate: "2026-06-13",
    });

    // Goal card should be visible with Edit button and date display
    expect(screen.getByText("June 13, 2026")).toBeInTheDocument();
    const editButton = screen.getByRole("button", { name: "Edit" });
    expect(editButton).toBeInTheDocument();

    // Click Edit
    await user.click(editButton);

    // Editor should appear (distance buttons and date input)
    const allHalfButtons = screen.getAllByRole("button", { name: "Half" });
    expect(allHalfButtons.length).toBeGreaterThan(1); // Multiple Half buttons when editing
    expect(screen.getByDisplayValue("2026-06-13")).toBeInTheDocument();

    // Click Done
    const doneButton = screen.getByRole("button", { name: "Done" });
    await user.click(doneButton);

    // Editor should collapse, goal card should show
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
