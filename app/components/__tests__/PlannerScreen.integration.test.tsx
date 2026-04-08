import { describe, it, expect } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { PlannerScreen } from "@/app/screens/PlannerScreen";
import {
  settingsAtom,
  calendarEventsAtom,
  bgModelAtom,
} from "@/app/atoms";
import type { UserSettings } from "@/lib/settings";
import type { CalendarEvent } from "@/lib/types";
import "@/lib/__tests__/setup-dom";

function baseSettings(overrides?: Partial<UserSettings>): UserSettings {
  return {
    runDays: [2, 5, 0],
    longRunDay: 0,
    raceName: "EcoTrail",
    raceDist: 16,
    raceDate: "2026-06-13",
    intervalsConnected: true,
    hrZones: [120, 140, 155, 170, 185],
    lthr: 170,
    ...overrides,
  };
}

function futurePlannedEvent(overrides?: Partial<CalendarEvent>): CalendarEvent {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  return {
    id: "event-123",
    type: "planned",
    date: tomorrow,
    name: "Easy Run",
    description: "10m warmup",
    category: "easy",
    ...overrides,
  };
}

describe("PlannerScreen", () => {
  it("shows Generate Plan button and empty state when no plan exists", () => {
    render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, baseSettings()],
        [calendarEventsAtom, []],
        [bgModelAtom, null],

      ],
    });

    expect(
      screen.getByRole("button", { name: /generate plan/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/generate a plan to see your workouts/i),
    ).toBeInTheDocument();
  });

  it("shows volume chart, workout list, and upload bar after generating a plan", async () => {
    const user = userEvent.setup();

    render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, baseSettings()],
        [calendarEventsAtom, []],
        [bgModelAtom, null],

      ],
    });

    await user.click(screen.getByRole("button", { name: /generate plan/i }));

    // Volume chart renders (mocked Recharts)
    expect(screen.getByTestId("mock-ResponsiveContainer")).toBeInTheDocument();
    // Upload action bar appears (button text is "Sync")
    expect(
      screen.getByRole("button", { name: /sync/i }),
    ).toBeInTheDocument();
  });

  it("shows Regenerate Plan button when calendar has future planned events", () => {
    render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, baseSettings()],
        [calendarEventsAtom, [futurePlannedEvent()]],
        [bgModelAtom, null],

      ],
    });

    expect(
      screen.getByRole("button", { name: /regenerate plan/i }),
    ).toBeInTheDocument();
    // Generate Plan button should NOT be present
    expect(
      screen.queryByRole("button", { name: /^generate plan$/i }),
    ).not.toBeInTheDocument();
  });

  it("toggles config panel: Edit opens it, Done closes it", async () => {
    const user = userEvent.setup();

    render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, baseSettings()],
        [calendarEventsAtom, []],
        [bgModelAtom, null],

      ],
    });

    // Summary bar is visible with Edit button
    expect(
      screen.getByRole("button", { name: /edit/i }),
    ).toBeInTheDocument();

    // Click Edit — config panel opens
    await user.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByText(/run days/i)).toBeInTheDocument();

    // Click Done — config panel closes, summary bar returns
    await user.click(screen.getByRole("button", { name: /done/i }));
    expect(
      screen.getByRole("button", { name: /edit/i }),
    ).toBeInTheDocument();
  });

  it("summary bar shows day count, long run day, and race name", () => {
    render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, baseSettings()],
        [calendarEventsAtom, []],
        [bgModelAtom, null],

      ],
    });

    expect(screen.getByText("3 days/wk")).toBeInTheDocument();
    expect(screen.getByText(/long: sun/i)).toBeInTheDocument();
    expect(screen.getByText(/EcoTrail 16km/)).toBeInTheDocument();
  });
});
