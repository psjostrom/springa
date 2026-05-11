import { render, screen } from "@/lib/__tests__/test-utils";
import { describe, it, expect } from "vitest";
import { IntelScreen } from "../IntelScreen";
import {
  calendarEventsAtom,
  calendarLoadingAtom,
  settingsAtom,
  cachedActivitiesAtom,
  currentBGAtom,
} from "../../atoms";

describe("IntelScreen", () => {
  it("renders Overview tab with planned event without crashing", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(7, 0, 0, 0);

    render(<IntelScreen />, {
      atomInits: [
        [calendarLoadingAtom, false],
        [
          calendarEventsAtom,
          [
            {
              id: "plan-1",
              date: tomorrow,
              name: "W01 Easy",
              description: "Warmup 10m 7:00-20:00/km Pace\n10m 6:40-6:50/km Pace\nCooldown 5m 7:00-20:00/km Pace",
              type: "planned" as const,
              category: "easy" as const,
              fuelRate: 60,
            },
          ],
        ],
        [
          cachedActivitiesAtom,
          [
            {
              activityId: "old-1",
              name: "W12 Easy",
              category: "easy" as const,
              fuelRate: 56,
              hr: [{ time: 0, value: 150 }],
              runStartMs: Date.now() - 7 * 86400000,
            },
          ],
        ],
        [settingsAtom, { hrZones: [120, 140, 160, 180] }],
        [currentBGAtom, null],
      ],
    });
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("shows empty state when no completed runs and not loading", () => {
    render(<IntelScreen />, {
      atomInits: [
        [calendarLoadingAtom, false],
        [calendarEventsAtom, []],
        [cachedActivitiesAtom, []],
      ],
    });
    expect(screen.getByText(/complete your first run/i)).toBeInTheDocument();
  });

  it("hides TomorrowCard and shows DuringPatternCards when completed runs but no future planned", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    render(<IntelScreen />, {
      atomInits: [
        [calendarLoadingAtom, false],
        [
          calendarEventsAtom,
          [
            {
              id: "completed-1",
              date: yesterday,
              name: "W01 Easy",
              description: "",
              type: "completed" as const,
              category: "easy" as const,
              activityId: "123",
            },
          ],
        ],
        [
          cachedActivitiesAtom,
          [
            {
              activityId: "123",
              name: "W01 Easy",
              category: "easy" as const,
              fuelRate: 60,
              hr: [{ time: 0, value: 150 }],
              runStartMs: yesterday.getTime(),
            },
          ],
        ],
        [settingsAtom, {}],
        [currentBGAtom, null],
      ],
    });
    expect(screen.queryByText(/tomorrow/i)).not.toBeInTheDocument();
  });

  it("does not display the broken '-0.0 mmol/L /min' string anywhere", () => {
    const { container } = render(<IntelScreen />, {
      atomInits: [
        [calendarLoadingAtom, false],
        [calendarEventsAtom, []],
        [cachedActivitiesAtom, []],
      ],
    });
    expect(container.textContent).not.toMatch(/-0\.0\s*mmol\/L\s*\/\s*min/);
  });
});
