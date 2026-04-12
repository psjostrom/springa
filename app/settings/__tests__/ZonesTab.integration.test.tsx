import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import type { UserSettings } from "@/lib/settings";
import { ZonesTab } from "../ZonesTab";
import "@/lib/__tests__/setup-dom";

const validSettings: UserSettings = {
  totalWeeks: 18,
  startKm: 8,
};

function renderTab(overrides: Partial<UserSettings> = {}) {
  // eslint-disable-next-line no-restricted-syntax -- callback spy, not a module mock
  const onSave = vi.fn<(partial: Partial<UserSettings>) => Promise<void>>().mockResolvedValue(undefined);
  const settings = { ...validSettings, ...overrides };
  render(<ZonesTab settings={settings} onSave={onSave} />);
  return { onSave };
}

describe("ZonesTab HR zones", () => {
  it("renders HR zones section when maxHr is set", () => {
    renderTab({
      maxHr: 193,
      intervalsConnected: true,
    });

    expect(screen.getByText("Max HR")).toBeInTheDocument();

    // Max HR input should have the value (use displayValue since label isn't connected)
    expect(screen.getByDisplayValue("193")).toBeInTheDocument();

    // Zone names should be visible
    expect(screen.getByText("Recovery")).toBeInTheDocument();
    expect(screen.getByText("Endurance")).toBeInTheDocument();
    expect(screen.getByText("Tempo")).toBeInTheDocument();
    expect(screen.getByText("Threshold")).toBeInTheDocument();
    expect(screen.getByText("VO2 Max")).toBeInTheDocument();
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

    const { onSave } = renderTab({
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
