import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchCalendar,
  fetchActivity,
  fetchActivityStreams,
  fetchStreams,
  fetchPaceCurves,
  updateEvent,
  uploadPlan,
  replaceWorkout,
  deleteEvent,
  deleteActivity,
} from "../intervalsClient";
import type { WorkoutEvent } from "../types";

describe("intervalsClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchCalendar", () => {
    it("calls the calendar proxy route with date range", async () => {
      const mockEvents = [
        {
          id: "1",
          date: new Date("2026-04-01"),
          name: "Test Run",
          description: "Test",
          type: "completed" as const,
          category: "easy" as const,
        },
      ];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockEvents),
        }),
      );

      const result = await fetchCalendar("2026-04-01", "2026-04-30");

      expect(fetch).toHaveBeenCalledWith(
        "/api/intervals/calendar?oldest=2026-04-01&newest=2026-04-30",
      );
      expect(result).toEqual(mockEvents);
    });

    it("throws on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Server error"),
        }),
      );

      await expect(fetchCalendar("2026-04-01", "2026-04-30")).rejects.toThrow(
        "Server error",
      );
    });
  });

  describe("fetchActivity", () => {
    it("fetches activity metadata without streams", async () => {
      const mockActivity = {
        id: "123",
        start_date: "2026-04-01T10:00:00",
        name: "Test Run",
        distance: 5000,
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockActivity),
        }),
      );

      const result = await fetchActivity("123");

      expect(fetch).toHaveBeenCalledWith("/api/intervals/activity/123");
      expect(result).toEqual(mockActivity);
    });

    it("returns null on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
        }),
      );

      const result = await fetchActivity("123");
      expect(result).toBeNull();
    });
  });

  describe("fetchActivityStreams", () => {
    it("fetches activity with streams using ?streams=1", async () => {
      const mockData = {
        avgHr: 150,
        maxHr: 175,
        streamData: { heartrate: [{ time: 0, value: 150 }] },
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockData),
        }),
      );

      const result = await fetchActivityStreams("123");

      expect(fetch).toHaveBeenCalledWith("/api/intervals/activity/123?streams=1");
      expect(result).toEqual(mockData);
    });

    it("throws on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Stream fetch failed"),
        }),
      );

      await expect(fetchActivityStreams("123")).rejects.toThrow(
        "Stream fetch failed",
      );
    });
  });

  describe("fetchStreams", () => {
    it("posts activity IDs to streams endpoint", async () => {
      const mockStreams = {
        "123": [{ type: "heartrate", data: [150, 155, 160] }],
        "456": [{ type: "heartrate", data: [140, 145, 150] }],
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockStreams),
        }),
      );

      const result = await fetchStreams(["123", "456"]);

      expect(fetch).toHaveBeenCalledWith("/api/intervals/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityIds: ["123", "456"] }),
      });
      expect(result).toEqual(mockStreams);
    });
  });

  describe("fetchPaceCurves", () => {
    it("fetches pace curves with default curve ID", async () => {
      const mockCurves = {
        bestEfforts: [],
        longestRun: null,
        curve: [],
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockCurves),
        }),
      );

      const result = await fetchPaceCurves();

      expect(fetch).toHaveBeenCalledWith("/api/intervals/pace-curves?curve=all");
      expect(result).toEqual(mockCurves);
    });

    it("fetches pace curves with custom curve ID", async () => {
      const mockCurves = {
        bestEfforts: [],
        longestRun: null,
        curve: [],
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockCurves),
        }),
      );

      const result = await fetchPaceCurves("recent");

      expect(fetch).toHaveBeenCalledWith(
        "/api/intervals/pace-curves?curve=recent",
      );
      expect(result).toEqual(mockCurves);
    });

    it("returns null on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
        }),
      );

      const result = await fetchPaceCurves();
      expect(result).toBeNull();
    });
  });

  describe("updateEvent", () => {
    it("sends PUT request to update event", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
        }),
      );

      await updateEvent(123, { name: "Updated Run", carbs_per_hour: 60 });

      expect(fetch).toHaveBeenCalledWith("/api/intervals/events/123", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Run", carbs_per_hour: 60 }),
      });
    });

    it("throws on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          text: () => Promise.resolve("Invalid update"),
        }),
      );

      await expect(
        updateEvent(123, { name: "Updated Run" }),
      ).rejects.toThrow("Invalid update");
    });
  });

  describe("uploadPlan", () => {
    it("posts events to bulk endpoint and returns count", async () => {
      const events: WorkoutEvent[] = [
        {
          start_date_local: new Date("2026-04-01T10:00:00"),
          name: "Test Run",
          description: "Test workout",
          external_id: "eco16-2026-04-01",
          type: "Run",
          fuelRate: 60,
        },
      ];

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ count: 1 }),
        }),
      );

      const result = await uploadPlan(events);

      expect(fetch).toHaveBeenCalledWith("/api/intervals/events/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
      });
      expect(result).toBe(1);
    });
  });

  describe("replaceWorkout", () => {
    it("posts to replace endpoint with event ID and workout", async () => {
      const workout: WorkoutEvent = {
        start_date_local: new Date("2026-04-01T10:00:00"),
        name: "Replacement Run",
        description: "New workout",
        external_id: "eco16-2026-04-01",
        type: "Run",
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ newId: 456 }),
        }),
      );

      const result = await replaceWorkout(123, workout);

      expect(fetch).toHaveBeenCalledWith("/api/intervals/events/replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingEventId: 123, workout }),
      });
      expect(result).toBe(456);
    });

    it("handles undefined existingEventId", async () => {
      const workout: WorkoutEvent = {
        start_date_local: new Date("2026-04-01T10:00:00"),
        name: "New Run",
        description: "New workout",
        external_id: "eco16-2026-04-01",
        type: "Run",
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ newId: 789 }),
        }),
      );

      const result = await replaceWorkout(undefined, workout);

      expect(fetch).toHaveBeenCalledWith("/api/intervals/events/replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingEventId: undefined, workout }),
      });
      expect(result).toBe(789);
    });
  });

  describe("deleteEvent", () => {
    it("sends DELETE request to event endpoint", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
        }),
      );

      await deleteEvent(123);

      expect(fetch).toHaveBeenCalledWith("/api/intervals/events/123", {
        method: "DELETE",
      });
    });

    it("throws on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve("Event not found"),
        }),
      );

      await expect(deleteEvent(123)).rejects.toThrow("Event not found");
    });
  });

  describe("deleteActivity", () => {
    it("sends DELETE request to activity endpoint", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
        }),
      );

      await deleteActivity("123");

      expect(fetch).toHaveBeenCalledWith("/api/intervals/activity/123", {
        method: "DELETE",
      });
    });

    it("throws on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve("Activity not found"),
        }),
      );

      await expect(deleteActivity("123")).rejects.toThrow("Activity not found");
    });
  });
});
