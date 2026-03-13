import { describe, it, expect } from "vitest";
import { buildSyncPayload, hasLowConfidenceFuel } from "../syncPayload";
import type { AdaptedEvent } from "../adaptPlan";
import type { CalendarEvent } from "../types";

function makeOriginal(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-100",
    date: new Date("2026-03-15"),
    name: "W14 Short-Intervals",
    description: "Speed session",
    type: "planned",
    category: "interval",
    fuelRate: 30,
    duration: 2400,
    ...overrides,
  };
}

function makeAdapted(overrides: Partial<AdaptedEvent> = {}): AdaptedEvent {
  return {
    original: makeOriginal(),
    name: "W14 Short-Intervals",
    date: "2026-03-15",
    category: "interval",
    fuelRate: 36,
    description: "Adapted description",
    notes: "",
    structure: "",
    changes: [{ type: "fuel", detail: "Fuel: 30 → 36 g/h", confidence: "medium" }],
    externalId: "speed-14",
    swapped: false,
    ...overrides,
  };
}

describe("hasLowConfidenceFuel", () => {
  it("returns true when a fuel change has low confidence", () => {
    const event = makeAdapted({
      changes: [{ type: "fuel", detail: "Fuel: 30 → 36 g/h", confidence: "low" }],
    });
    expect(hasLowConfidenceFuel(event)).toBe(true);
  });

  it("returns false for medium confidence fuel", () => {
    const event = makeAdapted({
      changes: [{ type: "fuel", detail: "Fuel: 30 → 36 g/h", confidence: "medium" }],
    });
    expect(hasLowConfidenceFuel(event)).toBe(false);
  });

  it("returns false for swap changes", () => {
    const event = makeAdapted({
      changes: [{ type: "swap", detail: "Swapped to easy" }],
    });
    expect(hasLowConfidenceFuel(event)).toBe(false);
  });

  it("returns false when confidence is undefined on fuel change", () => {
    const event = makeAdapted({
      changes: [{ type: "fuel", detail: "Fuel: 35 → 28 g/h" }],
    });
    expect(hasLowConfidenceFuel(event)).toBe(false);
  });
});

describe("buildSyncPayload", () => {
  it("includes events with confident fuel changes", () => {
    const events = [makeAdapted()];
    const result = buildSyncPayload(events, {});

    expect(result).toHaveLength(1);
    expect(result[0].eventId).toBe(100);
    expect(result[0].fuelRate).toBe(36);
  });

  it("excludes low-confidence-only events by default", () => {
    const events = [
      makeAdapted({
        changes: [{ type: "fuel", detail: "Fuel: 30 → 36 g/h", confidence: "low" }],
      }),
    ];
    const result = buildSyncPayload(events, {});

    expect(result).toHaveLength(0);
  });

  it("includes low-confidence events when opted in", () => {
    const events = [
      makeAdapted({
        changes: [{ type: "fuel", detail: "Fuel: 30 → 36 g/h", confidence: "low" }],
      }),
    ];
    const result = buildSyncPayload(events, { "event-100": true });

    expect(result).toHaveLength(1);
    expect(result[0].fuelRate).toBe(36);
  });

  it("syncs swap+low-confidence with original fuel rate when not opted in", () => {
    const events = [
      makeAdapted({
        original: makeOriginal({ fuelRate: 30 }),
        fuelRate: 36,
        changes: [
          { type: "fuel", detail: "Fuel: 30 → 36 g/h", confidence: "low" },
          { type: "swap", detail: "Swapped to easy — TSB at -25" },
        ],
        swapped: true,
      }),
    ];
    const result = buildSyncPayload(events, {});

    expect(result).toHaveLength(1);
    expect(result[0].fuelRate).toBe(30); // original, not adapted
  });

  it("syncs swap+low-confidence with adapted fuel rate when opted in", () => {
    const events = [
      makeAdapted({
        original: makeOriginal({ fuelRate: 30 }),
        fuelRate: 36,
        changes: [
          { type: "fuel", detail: "Fuel: 30 → 36 g/h", confidence: "low" },
          { type: "swap", detail: "Swapped to easy — TSB at -25" },
        ],
        swapped: true,
      }),
    ];
    const result = buildSyncPayload(events, { "event-100": true });

    expect(result).toHaveLength(1);
    expect(result[0].fuelRate).toBe(36); // adapted
  });

  it("returns null fuelRate when original had no fuel rate (swap-only, not opted in)", () => {
    const events = [
      makeAdapted({
        original: makeOriginal({ fuelRate: undefined }),
        fuelRate: 36,
        changes: [
          { type: "fuel", detail: "Fuel: set to 36 g/h", confidence: "low" },
          { type: "swap", detail: "Swapped to easy" },
        ],
      }),
    ];
    const result = buildSyncPayload(events, {});

    expect(result).toHaveLength(1);
    expect(result[0].fuelRate).toBeNull();
  });

  it("handles multiple events with mixed confidence", () => {
    const events = [
      makeAdapted({
        original: makeOriginal({ id: "event-101" }),
        changes: [{ type: "fuel", detail: "Fuel change", confidence: "high" }],
      }),
      makeAdapted({
        original: makeOriginal({ id: "event-102" }),
        changes: [{ type: "fuel", detail: "Fuel change", confidence: "low" }],
      }),
      makeAdapted({
        original: makeOriginal({ id: "event-103" }),
        changes: [{ type: "swap", detail: "Swapped" }],
      }),
    ];
    const result = buildSyncPayload(events, {});

    expect(result).toHaveLength(2);
    expect(result[0].eventId).toBe(101); // high confidence
    expect(result[1].eventId).toBe(103); // swap (no fuel confidence issue)
  });
});
