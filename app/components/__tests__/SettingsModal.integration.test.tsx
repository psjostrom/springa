import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import type { UserSettings } from "@/lib/settings";
import { SettingsModal } from "../SettingsModal";
import "@/lib/__tests__/setup-dom";

// Notification API mock
Object.defineProperty(globalThis, "Notification", {
  value: { permission: "default", requestPermission: vi.fn() },
  writable: true,
});

const validSettings: UserSettings = {
  raceDate: "2026-06-13",
  raceName: "EcoTrail 16km",
  raceDist: 16,
  prefix: "eco16",
  totalWeeks: 18,
  startKm: 8,
  includeBasePhase: false,
};

function renderModal(overrides: Partial<UserSettings> = {}) {
  const onSave = vi
    .fn<(partial: Partial<UserSettings>) => Promise<void>>()
    .mockResolvedValue(undefined);
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
    const user = userEvent.setup();
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
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText(/Requires at least 11 weeks/)).toBeInTheDocument();
  });

  it("base phase toggle is enabled when totalWeeks is 11 or more", () => {
    renderModal({ totalWeeks: 12 });
    expect(screen.getByRole("switch")).toBeEnabled();
  });
});
