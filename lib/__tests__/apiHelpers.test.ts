import { describe, it, expect, vi, beforeEach, type MockedFunction } from "vitest";
import type { Session } from "next-auth";

// eslint-disable-next-line no-restricted-syntax -- next-auth boundary; auth() requires server-side session infrastructure
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// eslint-disable-next-line no-restricted-syntax -- isolate Bearer path from jose/crypto
vi.mock("@/lib/mobileAuth", () => ({
  verifyMobileToken: vi.fn(),
}));

// eslint-disable-next-line no-restricted-syntax -- Next headers() needs request context
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import { requireAuth, AuthError } from "@/lib/apiHelpers";
import { auth } from "@/lib/auth";
import { verifyMobileToken } from "@/lib/mobileAuth";
import { headers } from "next/headers";

describe("requireAuth", () => {
  const mockAuth = auth as unknown as MockedFunction<() => Promise<Session | null>>;
  const mockHeaders = headers as unknown as MockedFunction<() => Promise<Headers>>;

  beforeEach(() => {
    mockHeaders.mockResolvedValue(new Headers());
  });

  it("returns email when session exists", async () => {
    // eslint-disable-next-line no-restricted-syntax -- auth boundary mock
    mockAuth.mockResolvedValue({
      user: { email: "test@example.com" },
      expires: "",
    } as Session);
    const email = await requireAuth();
    expect(email).toBe("test@example.com");
  });

  it("throws when no session", async () => {
    // eslint-disable-next-line no-restricted-syntax -- auth boundary mock
    mockAuth.mockResolvedValue(null);
    await expect(requireAuth()).rejects.toThrow(AuthError);
  });

  it("throws when session has no email", async () => {
    // eslint-disable-next-line no-restricted-syntax -- auth boundary mock
    mockAuth.mockResolvedValue({
      user: {},
      expires: "",
    } as Session);
    await expect(requireAuth()).rejects.toThrow(AuthError);
  });

  it("throws when user is null", async () => {
    // eslint-disable-next-line no-restricted-syntax -- auth boundary mock
    mockAuth.mockResolvedValue({
      user: null as never,
      expires: "",
    } as Session);
    await expect(requireAuth()).rejects.toThrow(AuthError);
  });

  it("returns email from Bearer when no cookie session", async () => {
    // eslint-disable-next-line no-restricted-syntax -- auth boundary mock
    mockAuth.mockResolvedValue(null);
    // eslint-disable-next-line no-restricted-syntax -- headers boundary mock
    mockHeaders.mockResolvedValue(
      new Headers({ Authorization: "Bearer good.token" }),
    );
    // eslint-disable-next-line no-restricted-syntax -- token verify boundary mock
    (verifyMobileToken as unknown as MockedFunction<typeof verifyMobileToken>).mockResolvedValue({
      email: "native@example.com",
    });
    await expect(requireAuth()).resolves.toBe("native@example.com");
  });

  it("throws when Bearer token is invalid", async () => {
    // eslint-disable-next-line no-restricted-syntax -- auth boundary mock
    mockAuth.mockResolvedValue(null);
    // eslint-disable-next-line no-restricted-syntax -- headers boundary mock
    mockHeaders.mockResolvedValue(
      new Headers({ Authorization: "Bearer bad" }),
    );
    // eslint-disable-next-line no-restricted-syntax -- token verify boundary mock
    (verifyMobileToken as unknown as MockedFunction<typeof verifyMobileToken>).mockRejectedValue(
      new Error("bad"),
    );
    await expect(requireAuth()).rejects.toThrow(AuthError);
  });
});
