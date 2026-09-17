import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  return { holder: { db: null as unknown as Client } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

import { SCHEMA_DDL } from "../db";
import {
  getWorkoutProtocol,
  saveWorkoutProtocol,
} from "../workoutProtocolDb";

const EMAIL = "athlete@example.com";
const ACTIVITY_1 = "act-101";
const ACTIVITY_2 = "act-102";

describe("workoutProtocolDb", () => {
  beforeEach(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
    await holder.db.execute("DELETE FROM workout_protocols");
  });

  it("returns null when no protocol is saved for activity", async () => {
    const protocol = await getWorkoutProtocol(EMAIL, ACTIVITY_1);
    expect(protocol).toBeNull();
  });

  it("saves and retrieves full CamAPS FX protocol with same-during", async () => {
    await saveWorkoutProtocol(EMAIL, ACTIVITY_1, {
      beforeMode: "auto",
      beforeAutoSubmode: "ease_off",
      beforeTargetBg: 8.5,
      beforeTiming: "1-2h",
      duringSame: true,
      preRunCarbsG: 30,
      rescueCarbsG: null,
      note: "Ran in heat",
    });

    const saved = await getWorkoutProtocol(EMAIL, ACTIVITY_1);
    expect(saved).not.toBeNull();
    expect(saved).toMatchObject({
      activityId: ACTIVITY_1,
      beforeMode: "auto",
      beforeAutoSubmode: "ease_off",
      beforeTargetBg: 8.5,
      beforeTiming: "1-2h",
      duringSame: true,
      duringMode: null,
      preRunCarbsG: 30,
      rescueCarbsG: null,
      note: "Ran in heat",
    });
  });

  it("saves different during-run state and rescue carbs", async () => {
    await saveWorkoutProtocol(EMAIL, ACTIVITY_2, {
      beforeMode: "disconnected",
      beforeTiming: ">2h",
      duringSame: false,
      duringMode: "manual",
      duringManualUh: 0.22,
      preRunCarbsG: 15,
      rescueCarbsG: 20,
      note: "Had hypo, needed 20g gel",
    });

    const saved = await getWorkoutProtocol(EMAIL, ACTIVITY_2);
    expect(saved).not.toBeNull();
    expect(saved).toMatchObject({
      activityId: ACTIVITY_2,
      beforeMode: "disconnected",
      beforeTiming: ">2h",
      duringSame: false,
      duringMode: "manual",
      duringManualUh: 0.22,
      preRunCarbsG: 15,
      rescueCarbsG: 20,
      note: "Had hypo, needed 20g gel",
    });
  });

  it("saves and retrieves feel and rpe correctly", async () => {
    await saveWorkoutProtocol(EMAIL, ACTIVITY_1, {
      beforeMode: "auto",
      beforeTiming: "1-2h",
      duringSame: true,
      feel: 4,
      rpe: 6,
    });

    const protocol = await getWorkoutProtocol(EMAIL, ACTIVITY_1);
    expect(protocol).not.toBeNull();
    expect(protocol?.feel).toBe(4);
    expect(protocol?.rpe).toBe(6);
  });
});
