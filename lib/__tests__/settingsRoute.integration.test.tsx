import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  return { holder: { db: null as unknown as Client } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect, the one allowed exception
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

// eslint-disable-next-line no-restricted-syntax -- auth boundary mock
vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { email: "test@example.com" }, expires: "" }),
}));

import { PUT } from "@/app/api/settings/route";
import { canonicalPlannerConfig, type PlannerConfig } from "@/lib/plannerConfig";
import { SCHEMA_DDL } from "@/lib/db";
import { getPlannerMetadata, savePlannerMetadata } from "@/lib/plannerMetadata";
import { getUserSettings, saveUserSettings } from "@/lib/settings";

const EMAIL = "test@example.com";
const ANCHORED_CONFIG: PlannerConfig = {
  raceName: "Stockholm Half",
  raceDist: 21.1,
  raceDate: "2026-10-18",
  currentAbilityDist: 10,
  currentAbilitySecs: 3600,
  runDays: [0, 2, 4],
  longRunDay: 0,
  clubDay: null,
  clubType: null,
  totalWeeks: 14,
  startKm: 8,
  includeBasePhase: true,
  effortMetric: "pace",
};

beforeAll(async () => {
  await holder.db.executeMultiple(SCHEMA_DDL);
});

beforeEach(async () => {
  await holder.db.execute("DELETE FROM user_settings");
});

describe("/api/settings PUT", () => {
  it("returns 400 for malformed JSON", async () => {
    const res = await PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid or empty request body" });
  });

  it("preserves the anchored total weeks when saving an active plan", async () => {
    await saveUserSettings(EMAIL, ANCHORED_CONFIG);
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: canonicalPlannerConfig(ANCHORED_CONFIG),
      dirty: false,
    });

    const res = await PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentAbilitySecs: 3500 }),
      }),
    );

    expect(res.status).toBe(200);
    expect((await getUserSettings(EMAIL)).totalWeeks).toBe(14);
    expect(await getPlannerMetadata(EMAIL)).toMatchObject({ dirty: false });
  });

  it("does not create sticky dirty state when config is changed and reverted", async () => {
    await saveUserSettings(EMAIL, ANCHORED_CONFIG);
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: canonicalPlannerConfig(ANCHORED_CONFIG),
      dirty: false,
    });

    const changed = { ...ANCHORED_CONFIG, currentAbilitySecs: 3500 };
    const put = (config: PlannerConfig) => PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      }),
    );

    expect((await put(changed)).status).toBe(200);
    expect(await getPlannerMetadata(EMAIL)).toMatchObject({ dirty: false });

    expect((await put(ANCHORED_CONFIG)).status).toBe(200);
    expect(await getPlannerMetadata(EMAIL)).toMatchObject({ dirty: false });
  });

  it("does not reuse an active-plan anchor when saving a new program", async () => {
    await saveUserSettings(EMAIL, ANCHORED_CONFIG);
    await savePlannerMetadata(EMAIL, {
      generatedPlanConfig: canonicalPlannerConfig(ANCHORED_CONFIG),
      dirty: false,
    });

    const res = await PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...ANCHORED_CONFIG,
          totalWeeks: 8,
          plannerIntent: "start",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect((await getUserSettings(EMAIL)).totalWeeks).toBe(8);
    expect((await getUserSettings(EMAIL)).includeBasePhase).toBe(false);
  });
});
