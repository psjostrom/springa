import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { ProfileTab } from "../ProfileTab";
import { useState } from "react";
import type { UserSettings } from "@/lib/settings";

function HarnessProfile({ initial }: { initial: Partial<UserSettings> }) {
  const [settings, setSettings] = useState(initial);
  return (
    <ProfileTab
      settings={settings}
      onSave={async (partial: Partial<UserSettings>) => {
        setSettings((s: Partial<UserSettings>) => ({ ...s, ...partial }));
      }}
    />
  );
}

describe("ProfileTab", () => {
  it("renders existing profile values from settings", () => {
    render(
      <HarnessProfile
        initial={{
          dob: "1985-06-12",
          weightKg: 80,
          heightCm: 175,
          raceName: "EcoTrail",
          raceDist: 16,
          raceDate: "2026-06-13",
          t1dSinceYear: 2010,
          pumpModel: "Omnipod 5",
          cgmModel: "Dexcom G7",
          loopSystem: "Loop 3",
          pumpDuringRuns: "off",
        }}
      />,
    );
    expect(screen.getByLabelText(/date of birth/i)).toHaveValue("1985-06-12");
    expect(screen.getByLabelText(/weight/i)).toHaveValue(80);
    expect(screen.getByLabelText(/height/i)).toHaveValue(175);
    expect(screen.getByLabelText(/race name/i)).toHaveValue("EcoTrail");
    expect(screen.getByLabelText(/race distance/i)).toHaveValue(16);
    expect(screen.getByLabelText(/race date/i)).toHaveValue("2026-06-13");
    expect(screen.getByLabelText(/t1d since year/i)).toHaveValue(2010);
    expect(screen.getByLabelText(/pump model/i)).toHaveValue("Omnipod 5");
    expect(screen.getByLabelText(/cgm model/i)).toHaveValue("Dexcom G7");
    expect(screen.getByLabelText(/loop system/i)).toHaveValue("Loop 3");
    expect(screen.getByLabelText(/pump during runs/i)).toHaveValue("off");
  });

  it("updates input value after saving edited weight", async () => {
    render(<HarnessProfile initial={{ weightKg: 80 }} />);
    await userEvent.clear(screen.getByLabelText(/weight/i));
    await userEvent.type(screen.getByLabelText(/weight/i), "82");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/weight/i)).toHaveValue(82);
  });

  it("does not require any field — saves with empty values", async () => {
    render(<HarnessProfile initial={{}} />);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument();
    });
  });

  it("supports pumpDuringRuns enum select and reflects new value after save", async () => {
    render(<HarnessProfile initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/pump during runs/i), "off");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/pump during runs/i)).toHaveValue("off");
  });

  it("clears number field when emptied and shows empty after save", async () => {
    render(<HarnessProfile initial={{ weightKg: 80 }} />);
    await userEvent.clear(screen.getByLabelText(/weight/i));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/weight/i)).toHaveValue(null);
  });

  it("shows Saved status after successful save", async () => {
    render(<HarnessProfile initial={{}} />);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument();
    });
  });
});
