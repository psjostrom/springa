import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import type { UserSettings } from "@/lib/settings";
import { AccountTab } from "../AccountTab";
import "@/lib/__tests__/setup-dom";

// Notification API mock
Object.defineProperty(globalThis, "Notification", {
  value: { permission: "default", requestPermission: vi.fn() },
  writable: true,
});

const validSettings: UserSettings = {
  totalWeeks: 18,
  startKm: 8,
};

function renderTab(overrides: Partial<UserSettings> = {}) {
  // eslint-disable-next-line no-restricted-syntax -- callback spy, not a module mock
  const onSave = vi.fn<(partial: Partial<UserSettings>) => Promise<void>>().mockResolvedValue(undefined);
  const settings = { ...validSettings, ...overrides };
  render(<AccountTab email="test@example.com" settings={settings} onSave={onSave} />);
  return { onSave };
}

describe("AccountTab Intervals.icu API key", () => {
  it("connects with a valid API key", async () => {
    const user = userEvent.setup();
    renderTab({ intervalsConnected: false });

    const input = screen.getByPlaceholderText("Paste your API key");
    await user.type(input, "valid-api-key");
    await user.click(screen.getByRole("button", { name: /connect/i }));

    await screen.findByText("Connected");
    expect(screen.queryByPlaceholderText("Paste your API key")).not.toBeInTheDocument();
  });

  it("shows error for an invalid API key", async () => {
    const user = userEvent.setup();
    renderTab({ intervalsConnected: false });

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
    renderTab({ intervalsConnected: true });

    expect(screen.getByText("Connected")).toBeInTheDocument();

    await user.click(screen.getByText("Update API key"));

    const input = screen.getByPlaceholderText("Paste new key");
    await user.type(input, "new-valid-key");
    await user.click(screen.getByRole("button", { name: /update/i }));

    await screen.findByText("Connected");
    expect(screen.queryByPlaceholderText("Paste new key")).not.toBeInTheDocument();
  });

  it("propagates intervalsConnected state to parent after successful key validation", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTab({ intervalsConnected: false });

    const input = screen.getByPlaceholderText("Paste your API key");
    await user.type(input, "valid-api-key");
    await user.click(screen.getByRole("button", { name: /connect/i }));

    await screen.findByText("Connected");

    // Verify onSave was called with intervalsConnected: true
    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ intervalsConnected: true });
    });
  });
});

describe("AccountTab Diabetes Mode", () => {
  it("enables diabetes mode, enters NS credentials, tests connection, and saves", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTab({ diabetesMode: false });

    // Enable diabetes mode toggle
    const toggle = screen.getByRole("switch", { name: "Manage diabetes" });
    await user.click(toggle);

    // Enter Nightscout URL and secret
    const urlInput = screen.getByPlaceholderText("https://your-site.herokuapp.com");
    const secretInput = screen.getByPlaceholderText("Enter API secret");
    await user.type(urlInput, "https://test.herokuapp.com");
    await user.type(secretInput, "test-secret");

    // Test connection
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await screen.findByText(/connected/i);

    // Save
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          diabetesMode: true,
          nightscoutUrl: "https://test.herokuapp.com",
          nightscoutSecret: "test-secret",
        }),
      );
    });
  });

  it("changes insulin type and saves", async () => {
    const user = userEvent.setup();
    const { onSave } = renderTab({ diabetesMode: true, insulinType: "fiasp" });

    // Change insulin type
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "novorapid");

    // Save
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          insulinType: "novorapid",
        }),
      );
    });
  });
});
