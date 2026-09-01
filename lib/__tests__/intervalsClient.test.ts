// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";
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
import { capturedPutPayload, capturedUploadPayload } from "./msw/handlers";

describe("intervalsClient", () => {
  describe("fetchCalendar", () => {
    it("returns calendar events from proxy route", async () => {
      const result = await fetchCalendar("2026-04-01", "2026-04-30");
      expect(result.length).toBeGreaterThan(0);
    });

    it("throws on non-ok response", async () => {
      server.use(
        http.get("/api/intervals/calendar", () => {
          return new HttpResponse("Server error", { status: 500 });
        }),
      );

      await expect(fetchCalendar("2026-04-01", "2026-04-30")).rejects.toThrow();
    });
  });

  describe("fetchActivity", () => {
    it("returns activity metadata", async () => {
      const result = await fetchActivity("act-long-1");
      expect(result).not.toBeNull();
    });

    it("returns null on non-ok response", async () => {
      server.use(
        http.get("/api/intervals/activity/:activityId", () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      const result = await fetchActivity("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("fetchActivityStreams", () => {
    it("returns stream data from proxy route", async () => {
      const result = await fetchActivityStreams("act-long-1");
      expect(result).toBeDefined();
      expect(result.avgHr).toBeDefined();
    });

    it("throws on non-ok response", async () => {
      server.use(
        http.get("/api/intervals/activity/:activityId", () => {
          return new HttpResponse("Stream fetch failed", { status: 500 });
        }),
      );

      await expect(fetchActivityStreams("123")).rejects.toThrow();
    });
  });

  describe("fetchStreams", () => {
    it("posts activity IDs and returns streams", async () => {
      server.use(
        http.post("/api/intervals/streams", async () => {
          return HttpResponse.json({
            "123": [{ type: "heartrate", data: [150, 155, 160] }],
          });
        }),
      );

      const result = await fetchStreams(["123"]);
      expect(result["123"]).toBeDefined();
    });
  });

  describe("fetchPaceCurves", () => {
    it("returns pace curve data", async () => {
      server.use(
        http.get("/api/intervals/pace-curves", () => {
          return HttpResponse.json({
            bestEfforts: [],
            longestRun: null,
            curve: [],
          });
        }),
      );

      const result = await fetchPaceCurves();
      expect(result).toEqual({ bestEfforts: [], longestRun: null, curve: [] });
    });

    it("returns null on non-ok response", async () => {
      server.use(
        http.get("/api/intervals/pace-curves", () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      const result = await fetchPaceCurves();
      expect(result).toBeNull();
    });
  });

  describe("updateEvent", () => {
    it("sends PUT to proxy route", async () => {
      await updateEvent(123, { name: "Updated Run", carbs_per_hour: 60 });

      expect(capturedPutPayload).not.toBeNull();
      expect(capturedPutPayload!.url).toContain("/events/123");
      expect(capturedPutPayload!.body).toEqual({ name: "Updated Run", carbs_per_hour: 60 });
    });

    it("throws on non-ok response", async () => {
      server.use(
        http.put("/api/intervals/events/:eventId", () => {
          return new HttpResponse("Invalid update", { status: 400 });
        }),
      );

      await expect(updateEvent(123, { name: "Updated Run" })).rejects.toThrow();
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

      const result = await uploadPlan(events);
      expect(result).toBe(1);
      expect(capturedUploadPayload).toHaveLength(1);
    });
  });

  describe("replaceWorkout", () => {
    it("posts to replace endpoint and returns new ID", async () => {
      const workout: WorkoutEvent = {
        start_date_local: new Date("2026-04-01T10:00:00"),
        name: "Replacement Run",
        description: "New workout",
        external_id: "eco16-2026-04-01",
        type: "Run",
      };

      const result = await replaceWorkout(123, workout);
      expect(result).toBe(9999);
    });

    it("handles undefined existingEventId", async () => {
      const workout: WorkoutEvent = {
        start_date_local: new Date("2026-04-01T10:00:00"),
        name: "New Run",
        description: "New workout",
        external_id: "eco16-2026-04-01",
        type: "Run",
      };

      const result = await replaceWorkout(undefined, workout);
      expect(result).toBe(9999);
    });
  });

  describe("deleteEvent", () => {
    it("sends DELETE to proxy route", async () => {
      await expect(deleteEvent(123)).resolves.toBeUndefined();
    });

    it("throws on non-ok response", async () => {
      server.use(
        http.delete("/api/intervals/events/:eventId", () => {
          return new HttpResponse("Event not found", { status: 404 });
        }),
      );

      await expect(deleteEvent(123)).rejects.toThrow();
    });
  });

  describe("deleteActivity", () => {
    it("sends DELETE to proxy route", async () => {
      await expect(deleteActivity("123")).resolves.toBeUndefined();
    });

    it("throws on non-ok response", async () => {
      server.use(
        http.delete("/api/intervals/activity/:activityId", () => {
          return new HttpResponse("Activity not found", { status: 404 });
        }),
      );

      await expect(deleteActivity("123")).rejects.toThrow();
    });
  });
});
