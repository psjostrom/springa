import { describe, it, expect, beforeEach } from "vitest";
import {
  getGoogleAccessToken,
  ensureSpringaCalendar,
  syncEventsToGoogle,
  clearFutureGoogleEvents,
  findGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  formatEventDescription,
} from "../googleCalendar";
import type { WorkoutEvent } from "../types";
import { capturedGoogleCalendarEvents, capturedGoogleDeletedEventIds } from "./msw/handlers";

// Set env vars needed by getGoogleAccessToken
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

describe("getGoogleAccessToken", () => {
  it("exchanges refresh token for access token", async () => {
    const token = await getGoogleAccessToken("1//mock-refresh-token");
    expect(token).toBe("mock-access-token");
  });
});

describe("ensureSpringaCalendar", () => {
  it("returns existing calendar ID when valid", async () => {
    const id = await ensureSpringaCalendar("mock-access-token", "existing-cal-id", "Europe/Stockholm");
    expect(id).toBe("existing-cal-id");
  });

  it("creates new calendar when stored ID is null", async () => {
    const id = await ensureSpringaCalendar("mock-access-token", null, "Europe/Stockholm");
    expect(id).toBe("new-cal-id");
  });

  it("creates new calendar when stored ID returns 404", async () => {
    const id = await ensureSpringaCalendar("mock-access-token", "deleted-cal-id", "Europe/Stockholm");
    expect(id).toBe("new-cal-id");
  });
});

describe("syncEventsToGoogle", () => {
  beforeEach(() => {
    capturedGoogleCalendarEvents.length = 0;
  });

  it("creates events with correct fields", async () => {
    const events: WorkoutEvent[] = [
      {
        start_date_local: new Date("2026-04-01T12:00:00"),
        name: "W01 Easy eco16",
        description: "Warmup 10m 60%-70% LTHR\nMain 30m 70%-80% LTHR\nCooldown 15m 60%-70% LTHR",
        external_id: "easy-1",
        type: "Run",
        fuelRate: 45,
      },
    ];
    await syncEventsToGoogle("mock-access-token", "cal-id", events, "Europe/Stockholm");
    expect(capturedGoogleCalendarEvents).toHaveLength(1);
    const created = capturedGoogleCalendarEvents[0] as Record<string, unknown>;
    expect(created.summary).toBe("W01 Easy eco16");
    expect(created.start).toEqual({ dateTime: "2026-04-01T12:00:00", timeZone: "Europe/Stockholm" });
    expect(created.description).toContain("Fuel: 45 g/h");
  });
});

describe("clearFutureGoogleEvents", () => {
  beforeEach(() => {
    capturedGoogleDeletedEventIds.length = 0;
  });

  it("deletes all listed events", async () => {
    await clearFutureGoogleEvents("mock-access-token", "cal-id");
    expect(capturedGoogleDeletedEventIds).toEqual(["gcal-event-1", "gcal-event-2"]);
  });
});

describe("findGoogleEvent", () => {
  it("returns event ID when found", async () => {
    const id = await findGoogleEvent("mock-access-token", "cal-id", "W01 Easy", "2026-04-01");
    expect(id).toBe("gcal-event-1");
  });
});

describe("updateGoogleEvent", () => {
  it("patches event without throwing", async () => {
    await expect(
      updateGoogleEvent("mock-access-token", "cal-id", "gcal-event-1", { summary: "Updated" }),
    ).resolves.toBeUndefined();
  });
});

describe("deleteGoogleEvent", () => {
  beforeEach(() => {
    capturedGoogleDeletedEventIds.length = 0;
  });

  it("deletes event by ID", async () => {
    await deleteGoogleEvent("mock-access-token", "cal-id", "gcal-event-1");
    expect(capturedGoogleDeletedEventIds).toEqual(["gcal-event-1"]);
  });
});

describe("formatEventDescription", () => {
  it("includes fuel rate and workout steps", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date("2026-04-01T12:00:00"),
      name: "W01 Easy eco16",
      description: "Warmup 10m\nMain 30m\nCooldown 15m",
      external_id: "easy-1",
      type: "Run",
      fuelRate: 45,
    };
    const desc = formatEventDescription(event);
    expect(desc).toContain("Fuel: 45 g/h");
    expect(desc).toContain("Warmup 10m");
    expect(desc).toContain("Main 30m");
    expect(desc).toContain("Cooldown 15m");
  });

  it("includes HR zone target when zones provided", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date("2026-04-01T12:00:00"),
      name: "W01 Easy eco16",
      description: "Warmup 10m\nMain 30m",
      external_id: "easy-1",
      type: "Run",
      fuelRate: 60,
    };
    const desc = formatEventDescription(event, [135, 153, 162, 172, 189], 168);
    expect(desc).toContain("HR target:");
  });

  it("omits fuel line when no fuel rate", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date("2026-04-01T12:00:00"),
      name: "W01 Easy eco16",
      description: "Warmup 10m",
      external_id: "easy-1",
      type: "Run",
    };
    const desc = formatEventDescription(event);
    expect(desc).not.toContain("Fuel:");
  });
});
