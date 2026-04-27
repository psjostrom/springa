import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { useSWRConfig } from "swr";
import type { CalendarEvent } from "@/lib/types";
import type { WidgetProps } from "@/lib/modalWidgets";
import { buildRunAnalysisClientContextKey } from "@/lib/runAnalysisCache";
import { WidgetTabs } from "../WidgetTabs";

const completedEvent: CalendarEvent = {
  id: "e100",
  date: new Date("2026-03-08T10:00:00"),
  name: "W02 Long (10km)",
  description: "Easy long run.\n\nWarmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set\n- 40m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)",
  type: "completed",
  category: "long",
  activityId: "act-100",
  distance: 10000,
  duration: 3600,
  avgHr: 135,
  pace: 360,
  calories: 620,
  cadence: 170,
  maxHr: 158,
  load: 85,
  intensity: 72,
  fuelRate: 60,
  totalCarbs: 60,
  carbsIngested: 55,
  zoneTimes: { z1: 60, z2: 1800, z3: 900, z4: 300, z5: 60 },
  streamData: {
    heartrate: [
      { time: 0, value: 110 },
      { time: 600, value: 130 },
      { time: 1200, value: 145 },
      { time: 1800, value: 140 },
      { time: 2400, value: 135 },
      { time: 3000, value: 128 },
      { time: 3600, value: 115 },
    ],
    distance: [0, 1500, 3000, 5000, 6800, 8500, 10000],
  },
};

function buildProps(overrides?: Partial<WidgetProps>): WidgetProps {
  return {
    event: completedEvent,
    isLoadingStreamData: false,
    ...overrides,
  };
}

function RunAnalysisCacheSeeder({
  cacheKey,
  analysis,
}: {
  cacheKey: readonly [string, string, string] | readonly [string, string];
  analysis: string;
}) {
  const { mutate } = useSWRConfig();

  React.useEffect(() => {
    void mutate(cacheKey, analysis, { revalidate: false });
  }, [cacheKey, analysis, mutate]);

  return null;
}

const STORAGE_KEY = "springa:modal-widget-layout";

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

describe("WidgetTabs tab switching", () => {
  it("shows Overview tab content by default and hides Deep Dive content", () => {
    render(<WidgetTabs widgetProps={buildProps()} />);

    // Overview widgets visible (StatsWidget renders as cards)
    expect(screen.getByText("Calories")).toBeInTheDocument();
    expect(screen.getByText("55g")).toBeInTheDocument();
    expect(screen.getByText("Feedback")).toBeInTheDocument();

    // Deep Dive content not visible
    expect(screen.queryByText("Heart Rate Zones")).not.toBeInTheDocument();
  });

  it("switches to Deep Dive tab and shows HR Zones", async () => {
    const user = userEvent.setup();
    render(<WidgetTabs widgetProps={buildProps()} />);

    await user.click(screen.getByText("Deep Dive"));

    expect(screen.getByText("Heart Rate Zones")).toBeInTheDocument();
    // Overview content gone
    expect(screen.queryByText("Calories")).not.toBeInTheDocument();
  });

  it("switches to Analysis tab and does not show Feedback", async () => {
    const user = userEvent.setup();
    render(<WidgetTabs widgetProps={buildProps()} />);

    await user.click(screen.getByText("Analysis"));

    // Feedback is now on Overview, not Analysis
    expect(screen.queryByText("Feedback")).not.toBeInTheDocument();
    // Overview content gone
    expect(screen.queryByText("Calories")).not.toBeInTheDocument();
  });
});

describe("WidgetTabs edit mode", () => {
  it("enters and exits edit mode", async () => {
    const user = userEvent.setup();
    render(<WidgetTabs widgetProps={buildProps()} />);

    // Enter edit mode
    await user.click(screen.getByRole("button", { name: "Edit widget layout" }));

    expect(screen.getByText("Editing layout")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    // Widget labels visible as sortable rows
    expect(screen.getByText("Report Card")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();

    // Exit edit mode
    await user.click(screen.getByText("Done"));
    expect(screen.queryByText("Editing layout")).not.toBeInTheDocument();
  });

  it("resets edit mode when switching tabs", async () => {
    const user = userEvent.setup();
    render(<WidgetTabs widgetProps={buildProps()} />);

    // Enter edit mode on Overview
    await user.click(screen.getByRole("button", { name: "Edit widget layout" }));
    expect(screen.getByText("Editing layout")).toBeInTheDocument();

    // Switch to Deep Dive — edit mode resets (key={activeTab})
    await user.click(screen.getByText("Deep Dive"));
    expect(screen.queryByText("Editing layout")).not.toBeInTheDocument();
  });
});

describe("WidgetTabs hide/show widget", () => {
  it("hides a widget and shows it again", async () => {
    const user = userEvent.setup();
    render(<WidgetTabs widgetProps={buildProps()} />);

    // Stats visible initially
    expect(screen.getByText("Calories")).toBeInTheDocument();

    // Enter edit mode and hide Stats
    await user.click(screen.getByRole("button", { name: "Edit widget layout" }));
    await user.click(screen.getByRole("button", { name: "Hide Stats" }));
    await user.click(screen.getByText("Done"));

    // Stats widget no longer visible
    expect(screen.queryByText("Calories")).not.toBeInTheDocument();

    // Re-enter edit mode — Stats row shows as hidden (strikethrough via opacity)
    await user.click(screen.getByRole("button", { name: "Edit widget layout" }));
    const statsRow = screen.getByText("Stats");
    expect(statsRow.className).toContain("line-through");

    // Show Stats again
    await user.click(screen.getByRole("button", { name: "Show Stats" }));
    await user.click(screen.getByText("Done"));

    // Stats visible again
    expect(screen.getByText("Calories")).toBeInTheDocument();
  });
});

describe("WidgetTabs NextTime widget", () => {
  it("does not show Next Time when analysis is not cached", () => {
    render(<WidgetTabs widgetProps={buildProps()} />);
    // NextTimeWidget returns null when SWR cache has no analysis
    expect(screen.queryByText("Next Time")).not.toBeInTheDocument();
  });

  it("shows Next Time when the context-aware analysis cache is populated", async () => {
    const props = buildProps();
    const cacheKey = [
      "run-analysis",
      props.event.activityId!,
      buildRunAnalysisClientContextKey({
        event: props.event,
        diabetesMode: false,
        runBGContext: props.runBGContext,
        bgModel: props.bgModel,
      }),
    ] as const;

    render(
      <>
        <RunAnalysisCacheSeeder
          cacheKey={cacheKey}
          analysis={"**Next Time**:\n- Ease off the first 10 minutes"}
        />
        <WidgetTabs widgetProps={props} />
      </>,
    );

    expect(await screen.findByText("Next Time")).toBeInTheDocument();
    expect(screen.getByText("Ease off the first 10 minutes")).toBeInTheDocument();
  });

  it("does not read stale analysis from the legacy cache key", () => {
    const props = buildProps();

    render(
      <>
        <RunAnalysisCacheSeeder
          cacheKey={["run-analysis", props.event.activityId!]}
          analysis={"**Next Time**:\n- Legacy stale advice"}
        />
        <WidgetTabs widgetProps={props} />
      </>,
    );

    expect(screen.queryByText("Next Time")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy stale advice")).not.toBeInTheDocument();
  });
});

describe("WidgetTabs persistence", () => {
  it("persists hidden widgets to localStorage across remounts", async () => {
    const user = userEvent.setup();
    const props = buildProps();
    const { unmount } = render(<WidgetTabs widgetProps={props} />);

    // Hide Stats widget
    await user.click(screen.getByRole("button", { name: "Edit widget layout" }));
    await user.click(screen.getByRole("button", { name: "Hide Stats" }));
    await user.click(screen.getByText("Done"));

    // Verify localStorage was written
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!);
    expect(parsed.overview.hidden).toContain("stats");

    // Unmount and remount
    unmount();
    render(<WidgetTabs widgetProps={props} />);

    // Stats should still be hidden
    expect(screen.queryByText("Calories")).not.toBeInTheDocument();
  });
});
