import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  return { holder: { db: null as unknown as Client } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect, the one allowed exception
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

import { getGoogleCalendarContext } from "../googleCalendar";
import { SCHEMA_DDL } from "../db";
import { encrypt } from "../credentials";

const TEST_KEY = "a".repeat(64);
const EMAIL = "test@example.com";

describe("getGoogleCalendarContext", () => {
  beforeEach(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
    await holder.db.execute("DELETE FROM user_settings");
    await holder.db.execute({
      sql: "INSERT INTO user_settings (email, google_refresh_token, google_calendar_id, timezone) VALUES (?, ?, ?, ?)",
      args: [EMAIL, encrypt("1//mock-refresh", TEST_KEY), "existing-cal-id", "Europe/Stockholm"],
    });
  });

  it("returns accessToken and calendarId for valid user", async () => {
    const ctx = await getGoogleCalendarContext(EMAIL);
    expect(ctx).not.toBeNull();
    expect(ctx!.accessToken).toBe("mock-access-token");
    expect(ctx!.calendarId).toBe("existing-cal-id");
    expect(ctx!.timezone).toBe("Europe/Stockholm");
  });

  it("returns null when user has no refresh token", async () => {
    await holder.db.execute({
      sql: "UPDATE user_settings SET google_refresh_token = NULL WHERE email = ?",
      args: [EMAIL],
    });
    const ctx = await getGoogleCalendarContext(EMAIL);
    expect(ctx).toBeNull();
  });

  it("returns null for unknown user", async () => {
    const ctx = await getGoogleCalendarContext("nobody@example.com");
    expect(ctx).toBeNull();
  });

  it("clears refresh token on revoked grant (invalid_grant)", async () => {
    const { server } = await import("./msw/server");
    const { http, HttpResponse } = await import("msw");

    // Override token endpoint to return invalid_grant
    server.use(
      http.post("https://oauth2.googleapis.com/token", () => {
        return HttpResponse.json(
          { error: "invalid_grant", error_description: "Token has been revoked." },
          { status: 400 },
        );
      }),
    );

    const ctx = await getGoogleCalendarContext(EMAIL);
    expect(ctx).toBeNull();

    // Verify the token was cleared in DB
    const row = await holder.db.execute({
      sql: "SELECT google_refresh_token FROM user_settings WHERE email = ?",
      args: [EMAIL],
    });
    expect(row.rows[0].google_refresh_token).toBeNull();
  });

  it("preserves refresh token on transient Google failure", async () => {
    const { server } = await import("./msw/server");
    const { http, HttpResponse } = await import("msw");

    // Override token endpoint to return 500
    server.use(
      http.post("https://oauth2.googleapis.com/token", () => {
        return HttpResponse.json(
          { error: "server_error" },
          { status: 500 },
        );
      }),
    );

    const ctx = await getGoogleCalendarContext(EMAIL);
    expect(ctx).toBeNull();

    // Verify the token was NOT cleared in DB
    const row = await holder.db.execute({
      sql: "SELECT google_refresh_token FROM user_settings WHERE email = ?",
      args: [EMAIL],
    });
    expect(row.rows[0].google_refresh_token).not.toBeNull();
  });
});
