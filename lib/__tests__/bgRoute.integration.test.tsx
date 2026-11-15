import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  return { holder: { db: null as unknown as Client } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

const EMAIL = "test@test.com";

// eslint-disable-next-line no-restricted-syntax -- auth boundary mock; returns a resolved promise, not a mock chain
vi.mock("@/lib/auth", () => ({
  auth: () => Promise.resolve({ user: { email: EMAIL }, expires: "" }),
}));

import { GET } from "@/app/api/bg/route";
import { encrypt } from "../credentials";
import { SCHEMA_DDL } from "../db";
import { server } from "./msw/server";

const ENC_KEY = "a".repeat(64);
const NS_URL = "https://ns.example.com";
const MIN = 60 * 1000;

describe("/api/bg", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM user_settings");
    await holder.db.execute({
      sql: `INSERT INTO user_settings (email, nightscout_url, nightscout_secret, timezone, diabetes_mode)
            VALUES (?, ?, ?, ?, 1)`,
      args: [EMAIL, NS_URL, encrypt("secret", ENC_KEY), "Europe/Stockholm"],
    });
  });

  it("shows the latest reading's direction, not the 30-minute regression", async () => {
    const now = Date.now();
    // Flat for 25 minutes, then a fast drop in the last 5 minutes. A 30-minute
    // regression barely moves; the uploader's per-reading direction is DoubleDown.
    server.use(
      http.get(`${NS_URL}/api/v1/entries.json`, () => HttpResponse.json([
        { sgv: 142, date: now, direction: "DoubleDown", delta: -24 },
        ...[5, 10, 15, 20, 25].map((m) => ({ sgv: 166, date: now - m * MIN, direction: "Flat", delta: 0 })),
      ])),
    );

    const res = await GET();
    const json = await res.json() as {
      current: { direction: string; arrow: string };
      trend: Record<string, unknown> | null;
    };

    expect(json.current.direction).toBe("DoubleDown");
    expect(json.current.arrow).toBe("⇊");
    expect(json.trend).not.toBeNull();
    expect(Object.keys(json.trend!)).toEqual(["slope"]);
  });
});
