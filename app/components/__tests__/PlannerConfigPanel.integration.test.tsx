import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { PlannerConfigPanel } from "../PlannerConfigPanel";
import type { UserSettings } from "@/lib/settings";
import "@/lib/__tests__/setup-dom";

const baseSettings: UserSettings = {
  runDays: [2, 4, 0],
  longRunDay: 0,
  raceName: "EcoTrail",
  raceDist: 16,
  raceDate: "2026-06-13",
};

function renderPanel(settings: UserSettings = baseSettings) {
  const saves: Partial<UserSettings>[] = [];
  render(
    <PlannerConfigPanel
      settings={settings}
      onSave={async (partial) => {
        saves.push(partial);
      }}
      onDone={() => {}}
    />,
  );
  return { saves };
}

describe("PlannerConfigPanel", () => {
  it("saves the club day as the long run day when club type becomes long", async () => {
    const user = userEvent.setup();
    const { saves } = renderPanel({
      ...baseSettings,
      clubDay: 4,
      clubType: "varies",
    });

    await user.click(screen.getByRole("button", { name: "Long run" }));

    await waitFor(() => {
      expect(saves).toContainEqual({ clubType: "long", longRunDay: 4 });
    });
  });

  it("keeps longRunDay synced when changing the day of a long club run", async () => {
    const user = userEvent.setup();
    const { saves } = renderPanel({
      ...baseSettings,
      longRunDay: 2,
      clubDay: 2,
      clubType: "long",
    });

    const thuButtons = screen.getAllByRole("button", { name: "Thu" });
    await user.click(thuButtons[thuButtons.length - 1]);

    await waitFor(() => {
      expect(saves).toContainEqual({ clubDay: 4, longRunDay: 4 });
    });
  });
});
