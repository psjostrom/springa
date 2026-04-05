import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@/lib/__tests__/test-utils";
import { CoachScreen } from "../CoachScreen";
import {
  calendarEventsAtom,
  cachedActivitiesAtom,
  bgModelAtom,
  settingsAtom,
} from "../../atoms";
import type { UserSettings } from "@/lib/settings";
import "@/lib/__tests__/setup-dom";

// Mock scrollIntoView (not available in jsdom)
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Mock the AI chat — we're testing suggestion rendering, not the chat transport
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    status: "ready",
    error: null,
  }),
}));

vi.mock("ai", () => ({
  TextStreamChatTransport: vi.fn(),
}));

// Mock the useCoachData hook to avoid data fetching
vi.mock("../../hooks/useCoachData", () => ({
  useCoachData: () => ({ context: "", isLoading: false }),
}));

const baseSettings: UserSettings = {
  raceDate: "2026-06-13",
  raceName: "EcoTrail",
  diabetesMode: false,
};

describe("CoachScreen", () => {
  it("shows training-focused suggestions for new non-diabetes user", () => {
    render(<CoachScreen />, {
      atomInits: [
        [calendarEventsAtom, []],
        [cachedActivitiesAtom, []],
        [bgModelAtom, null],
        [settingsAtom, baseSettings],
      ],
    });

    // Should show suggestions (4 buttons)
    const buttons = screen.getAllByRole("button");
    // At least some suggestion buttons present (+ input submit)
    expect(buttons.length).toBeGreaterThanOrEqual(4);

    // Should NOT contain BG-related suggestions
    expect(screen.queryByText(/BG/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fuel rate/i)).not.toBeInTheDocument();
  });

  it("shows non-diabetes subtitle", () => {
    render(<CoachScreen />, {
      atomInits: [
        [calendarEventsAtom, []],
        [cachedActivitiesAtom, []],
        [bgModelAtom, null],
        [settingsAtom, baseSettings],
      ],
    });

    expect(screen.getByText(/Ask about training, fueling, recovery/)).toBeInTheDocument();
  });

  it("shows diabetes subtitle when diabetes mode is on", () => {
    render(<CoachScreen />, {
      atomInits: [
        [calendarEventsAtom, []],
        [cachedActivitiesAtom, []],
        [bgModelAtom, null],
        [settingsAtom, { ...baseSettings, diabetesMode: true }],
      ],
    });

    expect(screen.getByText(/Ask about training, fueling, BG management/)).toBeInTheDocument();
  });
});
