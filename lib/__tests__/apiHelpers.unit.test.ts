import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Session } from "next-auth";

const { authState } = vi.hoisted(() => ({
  authState: { session: null as Session | null },
}));

// eslint-disable-next-line no-restricted-syntax -- next-auth boundary; auth() requires server-side session infrastructure
vi.mock("@/lib/auth", () => ({
  auth: () => Promise.resolve(authState.session),
}));

import { requireAuth, AuthError } from "@/lib/apiHelpers";
import { signMobileToken } from "@/lib/mobileAuth";

const PREV_SECRET = process.env.AUTH_SECRET;
const TEST_AUTH_SECRET = "test-auth-secret-for-api-helpers";

beforeAll(() => {
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
});

afterAll(() => {
  if (PREV_SECRET === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = PREV_SECRET;
  }
});

describe("requireAuth", () => {
  it("returns email when session exists", async () => {
    authState.session = {
      user: { email: "test@example.com" },
      expires: "",
    } as Session;
    const email = await requireAuth();
    expect(email).toBe("test@example.com");
  });

  it("throws when no session and no Bearer", async () => {
    authState.session = null;
    await expect(requireAuth({ headerList: new Headers() })).rejects.toThrow(
      AuthError,
    );
  });

  it("throws when session has no email and no Bearer", async () => {
    authState.session = {
      user: {},
      expires: "",
    } as Session;
    await expect(requireAuth({ headerList: new Headers() })).rejects.toThrow(
      AuthError,
    );
  });

  it("throws when user is null and no Bearer", async () => {
    authState.session = {
      user: null as never,
      expires: "",
    } as Session;
    await expect(requireAuth({ headerList: new Headers() })).rejects.toThrow(
      AuthError,
    );
  });

  it("returns email from Bearer when no cookie session", async () => {
    authState.session = null;
    const { token } = await signMobileToken("native@example.com");
    await expect(
      requireAuth({
        headerList: new Headers({ Authorization: `Bearer ${token}` }),
      }),
    ).resolves.toBe("native@example.com");
  });

  it("prefers cookie email when Bearer header is also present", async () => {
    authState.session = {
      user: { email: "cookie@example.com" },
      expires: "",
    } as Session;
    const { token } = await signMobileToken("bearer@example.com");
    await expect(
      requireAuth({
        headerList: new Headers({ Authorization: `Bearer ${token}` }),
      }),
    ).resolves.toBe("cookie@example.com");
  });

  it("throws when Bearer token is invalid", async () => {
    authState.session = null;
    await expect(
      requireAuth({
        headerList: new Headers({ Authorization: "Bearer bad" }),
      }),
    ).rejects.toThrow(AuthError);
  });
});
