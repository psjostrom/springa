import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@/lib/__tests__/test-utils";
import {
  readingsAtom,
  trendAtom,
  currentBGAtom,
  trendSlopeAtom,
  settingsAtom,
} from "@/app/atoms";
import type { BGReading } from "@/lib/cgm";
import { BGGraphPopover } from "../BGGraphPopover";

function makeReading(ts: number, mmol: number, direction = "Flat"): BGReading {
  return {
    ts,
    mmol,
    sgv: Math.round(mmol * 18),
    direction,
    delta: 0,
  };
}

describe("BGGraphPopover", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates the relative age label while the popover stays open", () => {
    vi.setSystemTime(new Date("2026-04-23T12:00:00Z"));
    const readingTime = Date.now() - 5 * 60 * 1000;

    render(<BGGraphPopover onClose={() => {}} />, {
      atomInits: [
        [settingsAtom, {}],
        [readingsAtom, [makeReading(readingTime, 6.4)]],
        [currentBGAtom, 6.4],
        [trendAtom, "→"],
        [trendSlopeAtom, 0],
      ],
    });

    expect(screen.getByText("5m ago")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(screen.getByText("7m ago")).toBeInTheDocument();
  });
});