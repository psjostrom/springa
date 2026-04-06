import { describe, it, expect, vi, type MockedFunction } from "vitest";
import type { Session } from "next-auth";

// eslint-disable-next-line no-restricted-syntax -- next-auth boundary; auth() requires server-side session infrastructure
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { requireAuth, AuthError } from "@/lib/apiHelpers";
import { auth } from "@/lib/auth";

describe("requireAuth", () => {
  const mockAuth = auth as unknown as MockedFunction<() => Promise<Session | null>>;

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
});
