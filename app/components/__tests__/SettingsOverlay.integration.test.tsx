import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import type { UserSettings } from "@/lib/settings";
import { SettingsOverlay } from "../SettingsOverlay";

// Notification API mock (required by AccountTab)
Object.defineProperty(globalThis, "Notification", {
  value: { permission: "default", requestPermission: vi.fn() },
  writable: true,
});

const validSettings: UserSettings = {
  totalWeeks: 18,
  startKm: 8,
  intervalsConnected: true,
  sportSettingsId: 42,
};

function renderOverlay(overrides: Partial<UserSettings> = {}) {
  // eslint-disable-next-line no-restricted-syntax -- callback spy, not a module mock
  const onSave = vi.fn<(partial: Partial<UserSettings>) => Promise<void>>().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const settings = { ...validSettings, ...overrides };
  render(
    <SettingsOverlay
      email="test@example.com"
      settings={settings}
      onSave={onSave}
      onClose={onClose}
    />,
  );
  return { onSave, onClose };
}

describe("SettingsOverlay", () => {
  it("renders tabs after enrichment", async () => {
    renderOverlay();

    await screen.findByText("Your fitness");
  });

  it("renders tabs after enrichment failure", async () => {
    server.use(
      http.get("/api/settings", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    renderOverlay();

    // Should still render tab content after failed enrichment
    await screen.findByText("Your fitness");
  });

  it("closes on Escape key", async () => {
    const { onClose } = renderOverlay();

    // Wait for enrichment to complete so overlay is fully rendered
    await screen.findByText("Your fitness");

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("switches between tabs", async () => {
    renderOverlay();

    // Wait for enrichment
    await screen.findByText("Your fitness");

    // Switch to Plan tab
    await userEvent.click(screen.getByRole("button", { name: "Plan" }));
    expect(screen.getByText("Running temperature")).toBeInTheDocument();

    // Switch to Account tab
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText("Intervals.icu")).toBeInTheDocument();

    // Switch back to Training
    await userEvent.click(screen.getByRole("button", { name: "Training" }));
    expect(screen.getByText("Your fitness")).toBeInTheDocument();
  });

  it("propagates saved settings between tabs", async () => {
    const user = userEvent.setup();

    // Override enrichment to return intervalsConnected: false
    server.use(
      http.get("/api/settings", () => {
        return HttpResponse.json({ intervalsConnected: false });
      }),
    );

    renderOverlay({ intervalsConnected: false });

    // Wait for enrichment
    await screen.findByText("Your fitness");

    // Go to Account tab, connect Intervals.icu
    await user.click(screen.getByRole("button", { name: "Account" }));
    const input = screen.getByPlaceholderText("Paste your API key");
    await user.type(input, "valid-api-key");
    await user.click(screen.getByRole("button", { name: /connect/i }));

    // Verify connected state propagated via onSave
    await screen.findByText("Connected");
  });
});
