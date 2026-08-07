import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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

import { POST } from "@/app/api/qa/mobile/route";
import { SCHEMA_DDL } from "@/lib/db";
import { verifyMobileToken } from "@/lib/mobileAuth";

const TEST_AUTH_SECRET = "test-auth-secret-for-qa-mobile-route";
const QA_TOKEN = "qa-test-token-32chars-xxxxxxxxxxxx";
const QA_EMAIL = "argsint.rymdraket@gmail.com";

const PREV_AUTH_SECRET = process.env.AUTH_SECRET;

function postJson(body: unknown) {
  return POST(
    new Request("http://localhost/api/qa/mobile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  await holder.db.executeMultiple(SCHEMA_DDL);
});

afterAll(() => {
  if (PREV_AUTH_SECRET === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = PREV_AUTH_SECRET;
  }
});

beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_URL", "http://localhost:3000");
  vi.stubEnv("QA_AUTH_TOKEN", QA_TOKEN);
  vi.stubEnv("QA_AUTH_EMAIL", QA_EMAIL);
  delete process.env.VERCEL_ENV;
  delete process.env.NEXTAUTH_URL;
  await holder.db.execute("DELETE FROM user_settings");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/qa/mobile", () => {
  it("returns 404 when QA auth is disabled", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const res = await postJson({ token: QA_TOKEN });
    expect(res.status).toBe(404);
  });

  it("returns 401 for a wrong token", async () => {
    const res = await postJson({ token: "xx-test-token-32chars-xxxxxxxxxxxx" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/qa/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("issues a mobile JWT for the QA email", async () => {
    const res = await postJson({ token: QA_TOKEN });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      token: string;
      expiresAt: number;
      user: { email: string };
    };
    expect(json.user.email).toBe(QA_EMAIL);
    expect(json.expiresAt).toBeGreaterThan(Date.now() / 1000);
    await expect(verifyMobileToken(json.token)).resolves.toEqual({
      email: QA_EMAIL,
    });

    const rows = await holder.db.execute({
      sql: "SELECT email FROM user_settings WHERE email = ?",
      args: [QA_EMAIL],
    });
    expect(rows.rows).toHaveLength(1);
  });
});
