import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import type { CalendarEvent } from "@/lib/types";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  return {
    holder: { db: null as unknown as Client },
  };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

import { SCHEMA_DDL } from "@/lib/db";
import { applyWorkoutEventPrescriptions } from "@/lib/workoutPrescriptions";

describe("workout event prescriptions", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM workout_event_prescriptions");
  });

  it("stores the planned prescription and reuses it after pairing", async () => {
    const plannedEvent: CalendarEvent = {
      id: "event-104924874",
      date: new Date("2026-05-05T10:00:00Z"),
      name: "W13 Easy",
      description: "Warmup\n- 10m 68-83% pace\n\nMain set\n- 27m 68-83% pace\n\nCooldown\n- 15m 68-83% pace\n",
      type: "planned",
      category: "easy",
      duration: 3120,
      fuelRate: 64,
    };

    const [enrichedPlanned] = await applyWorkoutEventPrescriptions("test@example.com", [plannedEvent]);
    expect(enrichedPlanned.prescribedCarbsG).toBe(55);

    const stored = await holder.db.execute({
      sql: "SELECT prescribed_carbs_g, planned_duration_sec FROM workout_event_prescriptions WHERE email = ? AND event_id = ?",
      args: ["test@example.com", "104924874"],
    });
    expect(stored.rows).toEqual([{ prescribed_carbs_g: 55, planned_duration_sec: 3120 }]);

    const completedEvent: CalendarEvent = {
      id: "activity-i144999999",
      date: new Date("2026-05-05T11:15:00Z"),
      name: "W13 Easy",
      description: plannedEvent.description,
      type: "completed",
      category: "easy",
      duration: 3290,
      fuelRate: 64,
      pairedEventId: 104924874,
    };

    const [enrichedCompleted] = await applyWorkoutEventPrescriptions("test@example.com", [completedEvent]);
    expect(enrichedCompleted.prescribedCarbsG).toBe(55);
  });

  it("falls back to an exact description only when no stored row exists", async () => {
    const completedEvent: CalendarEvent = {
      id: "activity-act-56",
      date: new Date("2026-05-02T18:10:00Z"),
      name: "W12 Easy",
      description: "Warmup\n- 10m 68-83% pace\n\nMain set\n- 31m 68-83% pace\n\nCooldown\n- 15m 68-83% pace\n",
      type: "completed",
      category: "easy",
      duration: 3250,
      fuelRate: 60,
      pairedEventId: 202,
    };

    const [enrichedCompleted] = await applyWorkoutEventPrescriptions("test@example.com", [completedEvent]);
    expect(enrichedCompleted.prescribedCarbsG).toBe(56);

    const stored = await holder.db.execute({
      sql: "SELECT prescribed_carbs_g FROM workout_event_prescriptions WHERE email = ? AND event_id = ?",
      args: ["test@example.com", "202"],
    });
    expect(stored.rows).toEqual([]);
  });

  it("clears a stale stored prescription when the planned event no longer has one", async () => {
    const plannedEvent: CalendarEvent = {
      id: "event-104924874",
      date: new Date("2026-05-05T10:00:00Z"),
      name: "W13 Easy",
      description: "Warmup\n- 10m 68-83% pace\n\nMain set\n- 27m 68-83% pace\n\nCooldown\n- 15m 68-83% pace\n",
      type: "planned",
      category: "easy",
      duration: 3120,
      fuelRate: 64,
    };

    await applyWorkoutEventPrescriptions("test@example.com", [plannedEvent]);

    await applyWorkoutEventPrescriptions("test@example.com", [{
      ...plannedEvent,
      fuelRate: null,
    }]);

    // When fuelRate is removed, the stored prescription should be cleared (null).
    const stored = await holder.db.execute({
      sql: "SELECT prescribed_carbs_g, planned_duration_sec FROM workout_event_prescriptions WHERE email = ? AND event_id = ?",
      args: ["test@example.com", "104924874"],
    });
    expect(stored.rows).toEqual([{ prescribed_carbs_g: null, planned_duration_sec: 3120 }]);
  });
});