import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { http, HttpResponse } from "msw";
import { PlannerScreen } from "@/app/screens/PlannerScreen";
import {
  settingsAtom,
  calendarEventsAtom,
  calendarLoadingAtom,
  bgModelAtom,
} from "@/app/atoms";
import type { UserSettings } from "@/lib/settings";
import type { BGResponseModel } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";
import "@/lib/__tests__/setup-dom";
import { server } from "@/lib/__tests__/msw/server";
import { capturedUploadPayload, resetCaptures } from "@/lib/__tests__/msw/handlers";

function PlannerAutoAdaptHarness({
  autoAdapt,
  bgModel,
}: {
  autoAdapt: boolean;
  bgModel: BGResponseModel | null;
}) {
  const setBgModel = useSetAtom(bgModelAtom);

  useEffect(() => {
    setBgModel(bgModel);
  }, [bgModel, setBgModel]);

  return <PlannerScreen autoAdapt={autoAdapt} />;
}

function dateWeeksFromNow(weeks: number): string {
  const raceDate = new Date();
  raceDate.setDate(raceDate.getDate() + weeks * 7);
  const year = raceDate.getFullYear();
  const month = String(raceDate.getMonth() + 1).padStart(2, "0");
  const day = String(raceDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function futureRaceDate(): string {
  return dateWeeksFromNow(18);
}

function baseSettings(overrides?: Partial<UserSettings>): UserSettings {
  return {
    runDays: [2, 5, 0],
    longRunDay: 0,
    raceName: "EcoTrail",
    raceDist: 16,
    raceDate: futureRaceDate(),
    intervalsConnected: true,
    hrZones: [120, 140, 155, 170, 185],
    lthr: 170,
    ...overrides,
  };
}

function completedProgramSettings(overrides?: Partial<UserSettings>): UserSettings {
  return baseSettings({
    raceName: "EcoTrail",
    raceDate: "2026-06-13",
    raceDist: 16,
    currentAbilityDist: 10,
    currentAbilitySecs: 3300,
    totalWeeks: 18,
    startKm: 8,
    ...overrides,
  });
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

  it("shows a start new program banner after the race is complete", () => {
    render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, completedProgramSettings()],
        [calendarEventsAtom, []],
        [calendarLoadingAtom, false],
        [bgModelAtom, null],
      ],
    });

    expect(screen.getByText("EcoTrail is complete.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start New Program" })).toBeInTheDocument();
  });

  it("does not show the complete-program banner while calendar events are loading", () => {
    render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, completedProgramSettings()],
        [calendarEventsAtom, []],
        [calendarLoadingAtom, true],
        [bgModelAtom, null],
      ],
    });

    expect(screen.queryByText("EcoTrail is complete.")).not.toBeInTheDocument();
  });

  it("previews a new program without saving settings or uploading workouts", async () => {
    const user = userEvent.setup();
    resetCaptures();
    let capturedSettingsBody: unknown = null;
    server.use(
      http.put("/api/settings", async ({ request }) => {
        capturedSettingsBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );

    render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, completedProgramSettings()],
        [calendarEventsAtom, []],
        [bgModelAtom, null],
      ],
    });

    await user.click(screen.getByRole("button", { name: "Start New Program" }));
    await user.click(screen.getByRole("button", { name: "Preview plan" }));

    expect(screen.getByText("Ready to start?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Program" })).toBeInTheDocument();
    expect(screen.getByText(/will replace future workouts on your Springa calendars/i)).toBeInTheDocument();
    expect(capturedUploadPayload).toHaveLength(0);
    expect(capturedSettingsBody).toBeNull();
  });

  it("shows the new race in the planner summary during preview", async () => {
    const user = userEvent.setup();

    render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, completedProgramSettings()],
        [calendarEventsAtom, []],
        [bgModelAtom, null],
      ],
    });

    await user.click(screen.getByRole("button", { name: "Start New Program" }));
    await user.type(screen.getByLabelText("Race name"), "Stockholm Half Marathon");
    await user.clear(screen.getByLabelText("km"));
    await user.type(screen.getByLabelText("km"), "22");
    await user.click(screen.getByRole("button", { name: "Preview plan" }));

    expect(screen.getByText(/Stockholm Half Marathon 22km/)).toBeInTheDocument();
    expect(screen.queryByText(/EcoTrail 16km/)).not.toBeInTheDocument();
  });

  it("blocks preview when the new race date is too soon", async () => {
    const user = userEvent.setup();
    const { container } = render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, completedProgramSettings()],
        [calendarEventsAtom, []],
        [bgModelAtom, null],
      ],
    });

    await user.click(screen.getByRole("button", { name: "Start New Program" }));

    const dateInput = container.querySelector("#new-program-race-date");
    if (!dateInput) throw new Error("new program date input missing");
    await user.clear(dateInput);
    await user.type(dateInput, dateWeeksFromNow(9));
    await user.click(screen.getByRole("button", { name: "Preview plan" }));

    expect(screen.getByText("Race date must be at least 10 weeks away.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Program" })).not.toBeInTheDocument();
  });

  it("allows previewing a compressed 10-week new program with a warning", async () => {
    const user = userEvent.setup();
    const { container } = render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, completedProgramSettings()],
        [calendarEventsAtom, []],
        [bgModelAtom, null],
      ],
    });

    await user.click(screen.getByRole("button", { name: "Start New Program" }));

    const dateInput = container.querySelector("#new-program-race-date");
    if (!dateInput) throw new Error("new program date input missing");
    await user.clear(dateInput);
    await user.type(dateInput, dateWeeksFromNow(10));

    expect(screen.getByText("Compressed plan")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview plan" }));

    expect(screen.getByText("Ready to start?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Program" })).toBeInTheDocument();
    expect(screen.queryByText("Race date must be at least 10 weeks away.")).not.toBeInTheDocument();
  });

  it("saves settings and uploads workouts when starting the previewed program", async () => {
    const user = userEvent.setup();
    resetCaptures();
    let capturedSettingsBody: Record<string, unknown> | null = null;
    server.use(
      http.put("/api/settings", async ({ request }) => {
        capturedSettingsBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ ok: true });
      }),
    );

    render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, completedProgramSettings()],
        [calendarEventsAtom, []],
        [bgModelAtom, null],
      ],
    });

    await user.click(screen.getByRole("button", { name: "Start New Program" }));
    await user.type(screen.getByLabelText("Race name"), "Stockholm Half");
    await user.click(screen.getByRole("button", { name: "Preview plan" }));
    await user.click(screen.getByRole("button", { name: "Start Program" }));

    await waitFor(() => {
      expect(screen.getByText(/Started new program with \d+ workouts/)).toBeInTheDocument();
    });

    expect(capturedUploadPayload.length).toBeGreaterThan(0);
    expect(capturedSettingsBody).toEqual(
      expect.objectContaining({
        raceName: "Stockholm Half",
        raceDist: 16,
        currentAbilityDist: 10,
        currentAbilitySecs: 3300,
        startKm: 8,
        includeBasePhase: false,
      }),
    );
  });

  it("retries threshold pace sync after a failed new-program start", async () => {
    const user = userEvent.setup();
    resetCaptures();
    let thresholdCalls = 0;
    server.use(
      http.put("/api/intervals/threshold-pace", async () => {
        thresholdCalls += 1;
        if (thresholdCalls === 1) {
          return HttpResponse.json({ error: "temporary failure" }, { status: 502 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );

    render(<PlannerScreen />, {
      atomInits: [
        [settingsAtom, completedProgramSettings()],
        [calendarEventsAtom, []],
        [bgModelAtom, null],
      ],
    });

    await user.click(screen.getByRole("button", { name: "Start New Program" }));
    await user.click(screen.getByRole("button", { name: "5K" }));
    await user.click(screen.getByRole("button", { name: "Preview plan" }));
    await user.click(screen.getByRole("button", { name: "Start Program" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to push threshold pace")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText(/Started new program with \d+ workouts/)).toBeInTheDocument();
    });
    expect(thresholdCalls).toBe(2);
    expect(capturedUploadPayload.length).toBeGreaterThan(0);
  });

  it("keeps pending auto-adapt after the URL flag is stripped before bgModel loads", async () => {
    const capturedBodies: unknown[] = [];
    server.use(
      http.post("/api/adapt-plan", async ({ request }) => {
        capturedBodies.push(await request.json());
        return HttpResponse.json({ adaptedEvents: [] });
      }),
    );

    const model: BGResponseModel = {
      activitiesAnalyzed: 1,
      categories: { easy: null, long: null, interval: null },
      observations: [],
      bgByStartLevel: [],
      bgByEntrySlope: [],
      bgByTime: [],
      targetFuelRates: [],
    };

    const { rerender } = render(
      <PlannerAutoAdaptHarness autoAdapt={true} bgModel={null} />,
      {
        atomInits: [
          [settingsAtom, baseSettings()],
          [calendarEventsAtom, [futurePlannedEvent()]],
          [bgModelAtom, null],
        ],
      },
    );

    rerender(<PlannerAutoAdaptHarness autoAdapt={false} bgModel={model} />);

    await waitFor(() => {
      expect(capturedBodies).toHaveLength(1);
    });
    expect(screen.getByText(/Adapted 0 workouts/i)).toBeInTheDocument();
  });
});
