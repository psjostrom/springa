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
import type { BGResponseModel } from "@/lib/bgModel";
import type { CalendarEvent } from "@/lib/types";
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

  it("shows BG suggestions for diabetes user with run data", () => {
    const completedEvent = { id: "e1", type: "completed", date: new Date(), name: "Easy" } as CalendarEvent;
    const bgModel: BGResponseModel = {
      activitiesAnalyzed: 5,
      categories: { easy: null, long: null, interval: null },
      observations: [],
      bgByStartLevel: [],
      bgByEntrySlope: [],
      bgByTime: [],
      targetFuelRates: [],
    };

    // Run multiple renders to account for weighted randomization
    const allTexts = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const { unmount } = render(<CoachScreen />, {
        atomInits: [
          [calendarEventsAtom, [completedEvent]],
          [cachedActivitiesAtom, []],
          [bgModelAtom, bgModel],
          [settingsAtom, { ...baseSettings, diabetesMode: true }],
        ],
      });
      screen.getAllByRole("button").forEach((btn) => {
        if (btn.textContent) allTexts.add(btn.textContent);
      });
      unmount();
    }

    const hasBGSuggestion = [...allTexts].some((t) => /BG|fuel rate/i.test(t));
    expect(hasBGSuggestion).toBe(true);
  });
});
