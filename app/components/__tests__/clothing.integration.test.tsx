import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { CalendarEvent } from "@/lib/types";
import type { UserSettings } from "@/lib/settings";
import type { SMHIWeather } from "@/lib/smhi";
import { recommendClothing } from "@/lib/clothingCalculator";
import { EventModal } from "../EventModal";
import { SettingsModal } from "../SettingsModal";
import "@/lib/__tests__/setup-dom";

// Notification API mock (required by SettingsModal)
Object.defineProperty(globalThis, "Notification", {
  value: { permission: "default", requestPermission: vi.fn() },
  writable: true,
});

const noop = () => {};
const noopAsync = async () => {};

function weather(overrides: Partial<SMHIWeather> = {}): SMHIWeather {
  return {
    temp: 10,
    feelsLike: 10,
    windSpeed: 2,
    windGust: 4,
    precipitation: 0,
    precipCategory: 0,
    validTime: "2026-03-10T12:00:00Z",
    ...overrides,
  };
}

const plannedEasy: CalendarEvent = {
  id: "event-100",
  date: new Date("2026-03-10T14:00:00"),
  name: "W05 Easy",
  description: "Steady easy running.\n\n- 41m 68-83% LTHR (115-140 bpm)",
  type: "planned",
  category: "easy",
  fuelRate: 63,
};

const completedRun: CalendarEvent = {
  id: "activity-200",
  date: new Date("2026-03-08T10:00:00"),
  name: "W04 Easy",
  description: "Easy run.",
  type: "completed",
  category: "easy",
  activityId: "200",
};

describe("EventModal clothing recommendation", () => {
  it("renders clothing items for a planned event with weather data", () => {
    const clothing = recommendClothing(weather({ feelsLike: 7 }), "easy");

    render(
      <EventModal
        event={plannedEasy}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}

        clothing={clothing}
      />,
    );

    expect(screen.getByText("What to wear")).toBeInTheDocument();
    expect(screen.getByText("Long sleeve")).toBeInTheDocument();
    expect(screen.getByText("Tights")).toBeInTheDocument();
  });

  it("does not render clothing section when no weather data", () => {
    render(
      <EventModal
        event={plannedEasy}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}

      />,
    );

    expect(screen.queryByText("What to wear")).toBeNull();
  });

  it("does not render clothing for completed events even if provided", () => {
    const clothing = recommendClothing(weather({ feelsLike: 7 }), "easy");

    render(
      <EventModal
        event={completedRun}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}

        clothing={clothing}
      />,
    );

    expect(screen.queryByText("What to wear")).toBeNull();
  });

  it("shows rain badge when raining", () => {
    const clothing = recommendClothing(
      weather({ feelsLike: 12, precipCategory: 3, precipitation: 2.5 }),
      "easy",
    );

    render(
      <EventModal
        event={plannedEasy}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}

        clothing={clothing}
      />,
    );

    expect(screen.getByText("Rain 2.5 mm/h")).toBeInTheDocument();
    expect(screen.getByText("Cap")).toBeInTheDocument();
  });

  it("shows snow badge when snowing", () => {
    const clothing = recommendClothing(
      weather({ feelsLike: -2, precipCategory: 1, precipitation: 1.0 }),
      "easy",
    );

    render(
      <EventModal
        event={plannedEasy}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}

        clothing={clothing}
      />,
    );

    expect(screen.getByText("Snow 1.0 mm/h")).toBeInTheDocument();
  });
});

describe("full weather-to-clothing flow", () => {
  it("Stockholm March easy run: tights + long sleeve at 7°C feels-like", () => {
    const clothing = recommendClothing(weather({ temp: 9, feelsLike: 7, windSpeed: 3 }), "easy");

    render(
      <EventModal
        event={plannedEasy}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}

        clothing={clothing}
      />,
    );

    expect(screen.getByText("Tights")).toBeInTheDocument();
    expect(screen.getByText("Long sleeve")).toBeInTheDocument();
    // No accessories at 7°C
    expect(screen.queryByText("Gloves")).toBeNull();
    expect(screen.queryByText("Thin gloves")).toBeNull();
  });

  it("Stockholm March interval session: intensity offset makes it warmer", () => {
    const plannedInterval: CalendarEvent = {
      ...plannedEasy,
      name: "W05 Short Intervals",
      category: "interval",
    };
    // feelsLike 7 + intensity 5 = effective 12 → t-shirt + shorts
    const clothing = recommendClothing(weather({ temp: 9, feelsLike: 7, windSpeed: 3 }), "interval");

    render(
      <EventModal
        event={plannedInterval}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}

        clothing={clothing}
      />,
    );

    expect(screen.getByText("T-shirt")).toBeInTheDocument();
    expect(screen.getByText("Shorts")).toBeInTheDocument();
  });

  it("Stockholm winter easy run: full cold gear at -8°C", () => {
    const clothing = recommendClothing(weather({ temp: -6, feelsLike: -8, windSpeed: 4 }), "easy");

    render(
      <EventModal
        event={plannedEasy}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}

        clothing={clothing}
      />,
    );

    expect(screen.getByText("Tights")).toBeInTheDocument();
    expect(screen.getByText("Thermal top")).toBeInTheDocument();
    expect(screen.getByText("Fleece")).toBeInTheDocument();
    expect(screen.getByText("Wind jacket")).toBeInTheDocument();
    expect(screen.getByText("Beanie")).toBeInTheDocument();
    expect(screen.getByText("Buff")).toBeInTheDocument();
    expect(screen.getByText("Gloves")).toBeInTheDocument();
  });

  it("Stockholm summer easy run: singlet + shorts at 20°C", () => {
    const clothing = recommendClothing(weather({ temp: 20, feelsLike: 20, windSpeed: 1 }), "easy");

    render(
      <EventModal
        event={plannedEasy}
        onClose={noop}
        onDateSaved={noop}
        onDelete={noopAsync}

        clothing={clothing}
      />,
    );

    expect(screen.getByText("Singlet")).toBeInTheDocument();
    expect(screen.getByText("Shorts")).toBeInTheDocument();
  });

  it("warmth preference shifts recommendations", () => {
    // feelsLike 12, easy, preference +2 (run cold) → fl = 12-4 = 8 → long sleeve + tights
    const cold = recommendClothing(weather({ feelsLike: 12 }), "easy", 2);
    expect(cold.upper).toEqual(["Long sleeve"]);
    expect(cold.lower).toEqual(["Tights"]);

    // Same weather, preference -2 (run warm) → fl = 12+4 = 16 → t-shirt + shorts
    const warm = recommendClothing(weather({ feelsLike: 12 }), "easy", -2);
    expect(warm.upper).toEqual(["T-shirt"]);
    expect(warm.lower).toEqual(["Shorts"]);
  });
});

describe("SettingsModal warmth preference", () => {
  const validSettings: UserSettings = {
    raceDate: "2026-06-13",
    raceName: "EcoTrail 16km",
    raceDist: 16,

    totalWeeks: 18,
    startKm: 8,
    warmthPreference: 0,
  };

  function renderModal(overrides: Partial<UserSettings> = {}) {
    // eslint-disable-next-line no-restricted-syntax -- callback spy, not a module mock
    const onSave = vi.fn<(partial: Partial<UserSettings>) => Promise<void>>().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const settings = { ...validSettings, ...overrides };
    render(
      <SettingsModal
        email="test@example.com"
        settings={settings}
        onSave={onSave}
        onClose={onClose}
      />,
    );
    return { onSave, onClose };
  }

  it("renders running temperature section", () => {
    renderModal();
    expect(screen.getByText("Running temperature")).toBeInTheDocument();
    expect(screen.getByText("Warmer")).toBeInTheDocument();
    expect(screen.getByText("Colder")).toBeInTheDocument();
  });

  it("has 5 warmth buttons", () => {
    renderModal();
    const buttons = screen.getAllByRole("button", { name: /Warmth/ });
    expect(buttons).toHaveLength(5);
  });

  it("saves warmth preference when changed", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({ warmthPreference: 0 });

    // Click the coldest option (warmth +2)
    const buttons = screen.getAllByRole("button", { name: /Warmth/ });
    await user.click(buttons[4]); // last button = +2 (colder)

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ warmthPreference: 2 }),
    );
  });

  it("does not include warmthPreference in save when unchanged", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({ warmthPreference: 0 });

    await user.click(screen.getByRole("button", { name: "Save" }));

    // No changes → no save call (or empty object)
    if (onSave.mock.calls.length > 0) {
      expect(onSave.mock.calls[0][0]).not.toHaveProperty("warmthPreference");
    }
  });

  it("shows reset button when preference is non-neutral", async () => {
    const user = userEvent.setup();
    renderModal({ warmthPreference: 0 });

    // Initially no reset button
    expect(screen.queryByText("Reset to neutral")).toBeNull();

    // Select a non-neutral option
    const buttons = screen.getAllByRole("button", { name: /Warmth/ });
    await user.click(buttons[0]); // warmest (-2)

    expect(screen.getByText("Reset to neutral")).toBeInTheDocument();
  });

  it("reset button returns to neutral", async () => {
    const user = userEvent.setup();
    renderModal({ warmthPreference: 1 });

    // Reset should be visible since preference is 1
    expect(screen.getByText("Reset to neutral")).toBeInTheDocument();

    await user.click(screen.getByText("Reset to neutral"));

    // Reset button should disappear
    expect(screen.queryByText("Reset to neutral")).toBeNull();
  });
});
