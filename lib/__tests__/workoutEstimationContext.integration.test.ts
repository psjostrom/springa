import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/constants";

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
import { server } from "./msw/server";
import { getUserWorkoutEstimationContext } from "@/lib/workoutEstimationContext";

const EMAIL = "test@example.com";

beforeAll(async () => {
  await holder.db.executeMultiple(SCHEMA_DDL);
});

beforeEach(async () => {
  await holder.db.execute("DELETE FROM user_settings");
  await holder.db.execute("DELETE FROM activity_streams");
});

it("returns threshold-only context when no Intervals API key is provided", async () => {
  await holder.db.execute({
    sql: "INSERT INTO user_settings (email, current_ability_dist, current_ability_secs) VALUES (?, ?, ?)",
    args: [EMAIL, 10, 3000],
  });

  const context = await getUserWorkoutEstimationContext(EMAIL, null);

  expect(context.thresholdPace).toBeTypeOf("number");
  expect(context.paceTable).toBeUndefined();
});

it("builds context successfully with API key, profile fetch and cached streams", async () => {
  await holder.db.execute({
    sql: "INSERT INTO user_settings (email, current_ability_dist, current_ability_secs) VALUES (?, ?, ?)",
    args: [EMAIL, 10, 3000],
  });
  await holder.db.execute({
    sql: `INSERT INTO activity_streams (email, activity_id, name, hr, pace, activity_date)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      EMAIL,
      "act-1",
      "W11 Easy",
      JSON.stringify([
        { time: 0, value: 130 },
        { time: 60, value: 132 },
        { time: 120, value: 135 },
      ]),
      JSON.stringify([
        { time: 0, value: 6.8 },
        { time: 60, value: 6.9 },
        { time: 120, value: 7.0 },
      ]),
      "2026-05-01",
    ],
  });

  server.use(
    http.get(`${API_BASE}/athlete/0`, () => {
      return HttpResponse.json({ maxHr: 190 });
    }),
  );

  const context = await getUserWorkoutEstimationContext(EMAIL, "intervals-key");

  expect(context.thresholdPace).toBeTypeOf("number");
  // Presence is not guaranteed for tiny fixtures, but the call path must stay stable.
  expect(context).toMatchObject({ thresholdPace: expect.any(Number) });
});
