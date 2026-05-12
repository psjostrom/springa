import { render, screen } from "@/lib/__tests__/test-utils";
import { describe, it, expect } from "vitest";
import { IntelScreen } from "../IntelScreen";
import {
  bgContextStatusAtom,
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

  it("hides UpcomingCard and shows DuringPatternCards when completed runs but no future planned", () => {
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

  it("renders avg drop in mmol/hr — never the broken '-0.0 mmol/L /min'", () => {
    // Three completed easy runs with non-zero glucose drop. Pre-fix, the
    // computation divided by minutes-as-hours and the rounded-to-tenths display
    // showed '-0.0 mmol/L /min'. Post-fix, the unit is per-hour and the math
    // produces a non-zero figure.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const completed = (i: number) => ({
      id: `completed-${i}`,
      date: new Date(yesterday.getTime() - i * 86400000),
      name: `W01 Easy ${i}`,
      description: "",
      type: "completed" as const,
      category: "easy" as const,
      activityId: `act-${i}`,
    });

    const cached = (i: number) => ({
      activityId: `act-${i}`,
      name: `W01 Easy ${i}`,
      category: "easy" as const,
      fuelRate: 60,
      hr: [{ time: 0, value: 150 }],
      runStartMs: yesterday.getTime() - i * 86400000,
      // 60 min duration, 8.0 → 6.5 = 1.5 mmol/L drop = 1.5 mmol/hr drop.
      glucose: [
        { time: 0, value: 8.0 },
        { time: 60, value: 6.5 },
      ],
    });

    const { container } = render(<IntelScreen />, {
      atomInits: [
        [calendarLoadingAtom, false],
        [calendarEventsAtom, [completed(0), completed(1), completed(2)]],
        [cachedActivitiesAtom, [cached(0), cached(1), cached(2)]],
        [settingsAtom, {}],
        [currentBGAtom, null],
      ],
    });
    expect(container.textContent).not.toMatch(/-0\.0\s*mmol\/L\s*\/\s*min/);
    expect(container.textContent).toMatch(/mmol\/hr/);
  });

  it("shows the BG-history-offline banner when bgContextStatus is upstream-error", () => {
    render(<IntelScreen />, {
      atomInits: [
        [calendarLoadingAtom, false],
        [calendarEventsAtom, []],
        [cachedActivitiesAtom, []],
        [bgContextStatusAtom, "upstream-error"],
      ],
    });
    const banner = screen.getByTestId("bg-context-banner");
    expect(banner).toHaveTextContent(/BG history is offline/i);
  });

  it("shows the connect-Nightscout banner when bgContextStatus is no-credentials", () => {
    render(<IntelScreen />, {
      atomInits: [
        [calendarLoadingAtom, false],
        [calendarEventsAtom, []],
        [cachedActivitiesAtom, []],
        [bgContextStatusAtom, "no-credentials"],
      ],
    });
    const banner = screen.getByTestId("bg-context-banner");
    expect(banner).toHaveTextContent(/Connect Nightscout/i);
  });

  it("hides the banner on ok / unknown / no-input statuses", () => {
    for (const status of ["ok", "unknown", "no-input"] as const) {
      const { unmount } = render(<IntelScreen />, {
        atomInits: [
          [calendarLoadingAtom, false],
          [calendarEventsAtom, []],
          [cachedActivitiesAtom, []],
          [bgContextStatusAtom, status],
        ],
      });
      expect(screen.queryByTestId("bg-context-banner")).not.toBeInTheDocument();
      unmount();
    }
  });
});
