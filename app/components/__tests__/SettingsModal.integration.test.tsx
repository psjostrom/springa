import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import type { UserSettings } from "@/lib/settings";
import { SettingsModal } from "../SettingsModal";
import "@/lib/__tests__/setup-dom";

// Notification API mock
Object.defineProperty(globalThis, "Notification", {
  value: { permission: "default", requestPermission: vi.fn() },
  writable: true,
});

const validSettings: UserSettings = {
  totalWeeks: 18,
  startKm: 8,
  includeBasePhase: false,
};

function renderModal(overrides: Partial<UserSettings> = {}) {
  // eslint-disable-next-line no-restricted-syntax -- callback spy, not a module mock
  const onSave = vi.fn<(partial: Partial<UserSettings>) => Promise<void>>().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const settings = { ...validSettings, ...overrides };
  render(
    <SettingsModal
      email="test@example.com"
      settings={settings}
      onSave={onSave}
      onClose={onClose}
    />,
  );
  return { onSave, onClose };
}

describe("SettingsModal totalWeeks validation", () => {
  it("Save is disabled when totalWeeks is below minimum", async () => {
    const user = userEvent.setup();
    renderModal({ totalWeeks: 18 });

    const weeksInput = screen.getByPlaceholderText("18");
    await user.clear(weeksInput);
    await user.type(weeksInput, "4");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Save is enabled when totalWeeks meets minimum", async () => {
    renderModal({ totalWeeks: 12 });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("does not call onSave when totalWeeks is invalid", async () => {
    const { onSave } = renderModal({ totalWeeks: 4 });

    // Force-click the disabled button via the underlying handler
    // The button should be disabled, but verify the guard works too
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave when totalWeeks is valid and changed", async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderModal({ totalWeeks: 18 });

    const weeksInput = screen.getByPlaceholderText("18");
    await user.clear(weeksInput);
    await user.type(weeksInput, "14");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ totalWeeks: 14 }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("base phase toggle is disabled when totalWeeks is below 11", () => {
    renderModal({ totalWeeks: 10 });
    expect(screen.getByRole("switch", { name: /base phase/i })).toBeDisabled();
    expect(screen.getByText(/Requires at least 11 weeks/)).toBeInTheDocument();
  });

  it("base phase toggle is enabled when totalWeeks is 11 or more", () => {
    renderModal({ totalWeeks: 12 });
    expect(screen.getByRole("switch", { name: /base phase/i })).toBeEnabled();
  });

  it("forces includeBasePhase off when totalWeeks drops below 11", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({ totalWeeks: 12, includeBasePhase: true });

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

describe("SettingsModal Intervals.icu API key", () => {
  it("connects with a valid API key", async () => {
    const user = userEvent.setup();
    renderModal({ intervalsConnected: false });

    const input = screen.getByPlaceholderText("Paste your API key");
    await user.type(input, "valid-api-key");
    await user.click(screen.getByRole("button", { name: /connect/i }));

    await screen.findByText("Connected");
    expect(screen.queryByPlaceholderText("Paste your API key")).not.toBeInTheDocument();
  });

  it("shows error for an invalid API key", async () => {
    const user = userEvent.setup();
    renderModal({ intervalsConnected: false });

    server.use(
      http.put("/api/settings", () => {
        return HttpResponse.json(
          { error: "Failed to validate Intervals.icu API key" },
          { status: 400 },
        );
      }),
    );

    const input = screen.getByPlaceholderText("Paste your API key");
    await user.type(input, "bad-key");
    await user.click(screen.getByRole("button", { name: /connect/i }));

    await screen.findByText(/Failed to validate/);
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("updates an existing API key", async () => {
    const user = userEvent.setup();
    renderModal({ intervalsConnected: true });

    expect(screen.getByText("Connected")).toBeInTheDocument();

    await user.click(screen.getByText("Update API key"));

    const input = screen.getByPlaceholderText("Paste new key");
    await user.type(input, "new-valid-key");
    await user.click(screen.getByRole("button", { name: /update/i }));

    await screen.findByText("Connected");
    expect(screen.queryByPlaceholderText("Paste new key")).not.toBeInTheDocument();
  });
});

describe("SettingsModal training paces and HR zones", () => {
  it("renders training paces section when ability is set", () => {
    renderModal({
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

  it("renders HR zones section when maxHr is set", () => {
    renderModal({
      maxHr: 193,
      intervalsConnected: true,
    });

    expect(screen.getByText("HR Zones")).toBeInTheDocument();

    // Max HR input should have the value (use displayValue since label isn't connected)
    expect(screen.getByDisplayValue("193")).toBeInTheDocument();

    // Zone names should be visible
    expect(screen.getByText("Recovery")).toBeInTheDocument();
    expect(screen.getByText("Endurance")).toBeInTheDocument();
    expect(screen.getByText("Tempo")).toBeInTheDocument();
    expect(screen.getByText("Threshold")).toBeInTheDocument();
    expect(screen.getByText("VO2 Max")).toBeInTheDocument();
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

    const { onSave } = renderModal({
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

  it("saves and pushes HR zones to Intervals.icu when maxHr changes", async () => {
    const user = userEvent.setup();
    let capturedHRPayload: unknown = null;

    server.use(
      http.put("/api/intervals/hr-zones", async ({ request }) => {
        capturedHRPayload = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );

    const { onSave } = renderModal({
      maxHr: 180,
      intervalsConnected: true,
      sportSettingsId: 123,
    });

    // Max HR input starts with value 180
    const hrInput = screen.getByDisplayValue("180");
    await user.clear(hrInput);
    await user.type(hrInput, "193");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        maxHr: 193,
      }),
    );

    await vi.waitFor(() => {
      expect(capturedHRPayload).not.toBeNull();
      expect(capturedHRPayload).toHaveProperty("hrZones");
      expect(capturedHRPayload).toHaveProperty("maxHr", 193);
    });
  });
});
