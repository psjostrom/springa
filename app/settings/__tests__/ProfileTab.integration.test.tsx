import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ProfileTab } from "../ProfileTab";

describe("ProfileTab", () => {
  it("renders existing profile values from settings", () => {
    render(
      <ProfileTab
        settings={{
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
          targetStartBG: 8.5,
        }}
        onSave={vi.fn()}
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
    expect(screen.getByLabelText(/target start bg/i)).toHaveValue(8.5);
  });

  it("saves edited values via onSave", async () => {
    // eslint-disable-next-line no-restricted-syntax -- callback spy in test
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProfileTab settings={{ weightKg: 80 }} onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText(/weight/i));
    await userEvent.type(screen.getByLabelText(/weight/i), "82");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0];
    expect(saved.weightKg).toBe(82);
  });

  it("does not require any field — saves with empty values", async () => {
    // eslint-disable-next-line no-restricted-syntax -- callback spy in test
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProfileTab settings={{}} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("supports pumpDuringRuns enum select", async () => {
    // eslint-disable-next-line no-restricted-syntax -- callback spy in test
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProfileTab settings={{}} onSave={onSave} />);
    await userEvent.selectOptions(screen.getByLabelText(/pump during runs/i), "off");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].pumpDuringRuns).toBe("off");
  });

  it("clears number field to undefined when emptied", async () => {
    // eslint-disable-next-line no-restricted-syntax -- callback spy in test
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProfileTab settings={{ weightKg: 80 }} onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText(/weight/i));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0];
    expect(saved.weightKg).toBeUndefined();
  });

  it("shows Saved status after successful save", async () => {
    // eslint-disable-next-line no-restricted-syntax -- callback spy in test
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProfileTab settings={{}} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument());
  });
});
