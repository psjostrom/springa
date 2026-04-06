import React from "react";
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/__tests__/msw/server";
import { settingsAtom } from "../../atoms";
import { WorkoutGenerator } from "../WorkoutGenerator";
import { TEST_HR_ZONES, TEST_LTHR } from "@/lib/__tests__/testConstants";

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
    expect(screen.getByText("Sync to Intervals")).toBeInTheDocument();
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
    await user.click(screen.getByText("Sync to Intervals"));
    expect(await screen.findByText(/Server error/i)).toBeInTheDocument();
  });

  it("shows error when date is outside plan window", async () => {
    const user = userEvent.setup();
    renderGenerator({ date: new Date("2020-01-01") });
    await user.click(screen.getByRole("button", { name: /easy/i }));
    expect(screen.getByText(/outside the training plan/i)).toBeInTheDocument();
  });
});
