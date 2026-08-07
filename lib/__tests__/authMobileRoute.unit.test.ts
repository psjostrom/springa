import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";
import type { Client } from "@libsql/client";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { http, HttpResponse } from "msw";
import { server } from "./msw/server";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const TEST_GOOGLE_CLIENT_ID = "springa-test-google-client.apps.googleusercontent.com";
const TEST_AUTH_SECRET = "test-auth-secret-for-mobile-route";
const TEST_KID = "springa-test-google-kid";

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

import { POST } from "@/app/api/auth/mobile/route";
import { SCHEMA_DDL } from "@/lib/db";
import { verifyMobileToken } from "@/lib/mobileAuth";

const PREV_AUTH_SECRET = process.env.AUTH_SECRET;
const PREV_GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

let googlePrivateKey: CryptoKey;

async function signGoogleIdToken(
  claims: Record<string, unknown>,
  privateKey: CryptoKey = googlePrivateKey,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: TEST_KID })
    .setIssuer("https://accounts.google.com")
    .setAudience(TEST_GOOGLE_CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

function postJson(body: unknown) {
  return POST(
    new Request("http://localhost/api/auth/mobile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.GOOGLE_CLIENT_ID = TEST_GOOGLE_CLIENT_ID;

  const { privateKey, publicKey } = await generateKeyPair("RS256");
  googlePrivateKey = privateKey;
  const jwk = await exportJWK(publicKey);
  jwk.kid = TEST_KID;
  jwk.alg = "RS256";
  jwk.use = "sig";

  server.use(
    http.get(GOOGLE_CERTS_URL, () => HttpResponse.json({ keys: [jwk] })),
  );

  await holder.db.executeMultiple(SCHEMA_DDL);
});

afterAll(() => {
  if (PREV_AUTH_SECRET === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = PREV_AUTH_SECRET;
  }
  if (PREV_GOOGLE_CLIENT_ID === undefined) {
    delete process.env.GOOGLE_CLIENT_ID;
  } else {
    process.env.GOOGLE_CLIENT_ID = PREV_GOOGLE_CLIENT_ID;
  }
});

beforeEach(async () => {
  await holder.db.execute("DELETE FROM user_settings");
});

describe("POST /api/auth/mobile", () => {
  it("returns Springa token for a valid Google idToken", async () => {
    const idToken = await signGoogleIdToken({
      email: "runner@example.com",
      email_verified: true,
    });

    const res = await postJson({ idToken });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      expiresAt: number;
      user: { email: string };
    };
    expect(body.user).toEqual({ email: "runner@example.com" });
    expect(body.expiresAt).toBeGreaterThan(Date.now() / 1000);
    const verified = await verifyMobileToken(body.token);
    expect(verified.email).toBe("runner@example.com");

    const rows = await holder.db.execute({
      sql: "SELECT email FROM user_settings WHERE email = ?",
      args: ["runner@example.com"],
    });
    expect(rows.rows).toHaveLength(1);
  });

  it("returns 400 when idToken missing", async () => {
    const res = await postJson({});
    expect(res.status).toBe(400);
  });

  it("returns 401 when Google token invalid", async () => {
    const res = await postJson({ idToken: "nope" });
    expect(res.status).toBe(401);
  });

  it("returns 401 when Google email is not verified", async () => {
    const idToken = await signGoogleIdToken({
      email: "runner@example.com",
      email_verified: false,
    });
    const res = await postJson({ idToken });
    expect(res.status).toBe(401);
  });

  it("returns 500 when settings write fails after Google verify", async () => {
    const idToken = await signGoogleIdToken({
      email: "runner@example.com",
      email_verified: true,
    });
    holder.db.close();
    try {
      const res = await postJson({ idToken });
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ error: "Server error" });
    } finally {
      const actual =
        await vi.importActual<typeof import("@libsql/client")>("@libsql/client");
      holder.db = actual.createClient({ url: "file::memory:" });
      await holder.db.executeMultiple(SCHEMA_DDL);
    }
  });
});
