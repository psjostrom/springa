import React from "react";
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import { capturedUploadPayload } from "@/lib/__tests__/msw/handlers";
import { settingsAtom } from "../../atoms";
import { WorkoutGenerator } from "../WorkoutGenerator";
import { TEST_HR_ZONES, TEST_LTHR } from "@/lib/__tests__/testConstants";
import type { WorkoutEvent } from "@/lib/types";

const settings = {
  intervalsConnected: true,
  raceDate: "2027-06-12",
  raceDist: 16,
  totalWeeks: 12,
  startKm: 8,
  lthr: TEST_LTHR,
  hrZones: [...TEST_HR_ZONES],
  includeBasePhase: false,
};

// A Thursday in build week 5
const buildThursday = new Date("2027-05-06T12:00:00");

const noop = () => {};

function renderGenerator(props?: { existingEventId?: number; existingEventName?: string; date?: Date }) {
  return render(
    <WorkoutGenerator
      date={props?.date ?? buildThursday}
      existingEventId={props?.existingEventId}
      existingEventName={props?.existingEventName}
      onGenerated={noop}
      onCancel={noop}
    />,
    { atomInits: [[settingsAtom, settings]] },
  );
}

describe("WorkoutGenerator", () => {
  it("renders category picker with four options", () => {
    renderGenerator();
    expect(screen.getByRole("button", { name: /easy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quality/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /long/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /club run/i })).toBeInTheDocument();
  });

  it("shows suggested badge on the recommended category", () => {
    renderGenerator();
    expect(screen.getByText("Suggested")).toBeInTheDocument();
  });

  it("shows replacing context when existingEventName is provided", () => {
    renderGenerator({ existingEventName: "W05 Hills" });
    expect(screen.getByText("W05 Hills")).toBeInTheDocument();
    expect(screen.getByText(/replacing/i)).toBeInTheDocument();
  });

  it("shows workout preview after picking a category", async () => {
    const user = userEvent.setup();
    renderGenerator();
    await user.click(screen.getByRole("button", { name: /easy/i }));
    expect(screen.getByText("Sync Workouts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("returns to picker when Back is clicked", async () => {
    const user = userEvent.setup();
    renderGenerator();
    await user.click(screen.getByRole("button", { name: /easy/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByRole("button", { name: /quality/i })).toBeInTheDocument();
  });

  it("shows error when sync fails", async () => {
    server.use(
      http.post("/api/intervals/events/replace", () => {
        return new HttpResponse("Server error", { status: 500 });
      }),
    );

    const user = userEvent.setup();
    renderGenerator();
    await user.click(screen.getByRole("button", { name: /easy/i }));
    await user.click(screen.getByText("Sync Workouts"));
    expect(await screen.findByText(/Server error/i)).toBeInTheDocument();
  });

  it("shows error when date is outside plan window", async () => {
    const user = userEvent.setup();
    renderGenerator({ date: new Date("2020-01-01") });
    await user.click(screen.getByRole("button", { name: /easy/i }));
    expect(screen.getByText(/outside the training plan/i)).toBeInTheDocument();
  });

  it("uses plan effortMetric hr in generated preview", async () => {
    const user = userEvent.setup();
    render(
      <WorkoutGenerator
        date={buildThursday}
        onGenerated={noop}
        onCancel={noop}
      />,
      {
        atomInits: [[settingsAtom, { ...settings, effortMetric: "hr" as const }]],
      },
    );
    await user.click(screen.getByRole("button", { name: /easy/i }));
    expect(screen.getByText(/Sync Workouts/i)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/\d+-\d+ bpm/);
    expect(document.body.textContent).not.toMatch(/\/km Pace|% pace/);
    await user.click(screen.getByText("Sync Workouts"));
    await waitFor(() => {
      expect(capturedUploadPayload.length).toBe(1);
    });
    const workout = capturedUploadPayload[0] as WorkoutEvent;
    expect(workout.description).toMatch(/% LTHR \(\d+-\d+ bpm\)/);
    expect(workout.description).not.toMatch(/\/km Pace|% pace/);
    expect(workout.name).not.toMatch(/By Feel$/);
  });

  it("uses plan effortMetric feel in generated preview", async () => {
    const user = userEvent.setup();
    render(
      <WorkoutGenerator
        date={buildThursday}
        onGenerated={noop}
        onCancel={noop}
      />,
      {
        atomInits: [[settingsAtom, { ...settings, effortMetric: "feel" as const }]],
      },
    );
    await user.click(screen.getByRole("button", { name: /easy/i }));
    expect(document.body.textContent).not.toMatch(/% LTHR|\/km Pace|% pace/);
    await user.click(screen.getByText("Sync Workouts"));
    await waitFor(() => {
      expect(capturedUploadPayload.length).toBe(1);
    });
    const workout = capturedUploadPayload[0] as WorkoutEvent;
    expect(workout.name).toMatch(/By Feel$/);
    expect(workout.description).not.toMatch(/% LTHR|\/km Pace|% pace/);
  });
});
