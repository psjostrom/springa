import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/lib/__tests__/test-utils";
import userEvent from "@testing-library/user-event";
import { WatchStep } from "../WatchStep";
import "@/lib/__tests__/setup-dom";
import type { PlatformConnection } from "@/lib/intervalsApi";

function mockFetch(platforms: PlatformConnection[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ platforms }),
  });
}

describe("WatchStep", () => {
  const onNext = vi.fn();
  const onBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch([]);
  });

  it("shows green state when Garmin is connected and syncing", async () => {
    global.fetch = mockFetch([
      { platform: "garmin", linked: true, syncActivities: true, uploadWorkouts: true },
    ]);

    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Your Garmin is connected and syncing activities/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Planned workouts will sync to your watch automatically/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("shows watch selector when no connection exists", async () => {
    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("What watch do you use?")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows Intervals.icu Settings instructions when Garmin is selected", async () => {
    const user = userEvent.setup();
    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("What watch do you use?")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Garmin" }));

    expect(screen.getByText(/Go to/i)).toBeInTheDocument();
    expect(screen.getByText(/Intervals.icu → Settings → Connections/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Intervals.icu Settings/i })).toBeInTheDocument();
  });

  it("shows HealthFit instructions when Apple Watch is selected", async () => {
    const user = userEvent.setup();
    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("What watch do you use?")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Apple Watch" }));

    expect(screen.getByRole("link", { name: /HealthFit on App Store/i })).toBeInTheDocument();
    expect(screen.getByText(/\$7, one-time/i)).toBeInTheDocument();
  });

  it("shows Health Sync instructions when Wear OS is selected", async () => {
    const user = userEvent.setup();
    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("What watch do you use?")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Wear OS/ }));

    expect(screen.getByRole("link", { name: /Health Sync on Google Play/i })).toBeInTheDocument();
    expect(screen.getByText(/~\$3, one-time/i)).toBeInTheDocument();
  });

  it("shows warning when no watch is selected", async () => {
    const user = userEvent.setup();
    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("What watch do you use?")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /I don't have a running watch/i }));

    expect(screen.getByText("A running watch is required")).toBeInTheDocument();
    expect(screen.getByText(/Springa needs run data from a GPS watch/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows Strava-only warning with continue option", async () => {
    global.fetch = mockFetch([
      { platform: "strava", linked: true, syncActivities: true, uploadWorkouts: false },
    ]);

    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Strava is connected, but has API restrictions/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/For the best experience, connect your watch directly/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Strava anyway/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("refetches when Check again is clicked", async () => {
    const user = userEvent.setup();
    const firstFetch = mockFetch([]);
    const secondFetch = mockFetch([
      { platform: "garmin", linked: true, syncActivities: true, uploadWorkouts: true },
    ]);

    global.fetch = firstFetch;
    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("What watch do you use?")).toBeInTheDocument();
    });

    // Select Garmin to show "Check again" button
    await user.click(screen.getByRole("button", { name: "Garmin" }));

    // Mock successful connection on second fetch
    global.fetch = secondFetch;
    await user.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => {
      expect(screen.getByText(/Your Garmin is connected and syncing activities/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("calls onNext when Next is clicked in connected state", async () => {
    const user = userEvent.setup();
    global.fetch = mockFetch([
      { platform: "garmin", linked: true, syncActivities: true, uploadWorkouts: true },
    ]);

    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Your Garmin is connected/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("calls onBack when Back is clicked", async () => {
    const user = userEvent.setup();
    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("What watch do you use?")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows upload prompt when connected but uploadWorkouts is false", async () => {
    global.fetch = mockFetch([
      { platform: "garmin", linked: true, syncActivities: true, uploadWorkouts: false },
    ]);

    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Your Garmin is connected/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/To get planned workouts on your watch/i)).toBeInTheDocument();
  });

  it("shows combined message when multiple platforms are syncing", async () => {
    global.fetch = mockFetch([
      { platform: "garmin", linked: true, syncActivities: true, uploadWorkouts: true },
      { platform: "polar", linked: true, syncActivities: true, uploadWorkouts: false },
    ]);

    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Your Garmin & Polar is connected/i)).toBeInTheDocument();
    });
  });

  it("shows error banner when fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));

    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Couldn't check your connections/i)).toBeInTheDocument();
    });

    expect(screen.getByText("What watch do you use?")).toBeInTheDocument();
  });

  it("shows sync-off warning when platform is linked but sync disabled", async () => {
    global.fetch = mockFetch([
      { platform: "garmin", linked: true, syncActivities: false, uploadWorkouts: false },
    ]);

    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Your Garmin is connected but activity sync is turned off/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Enable it in/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Intervals.icu → Settings → Connections/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
