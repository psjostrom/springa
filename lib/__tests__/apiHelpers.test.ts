import { describe, it, expect, vi, afterEach, type MockedFunction } from "vitest";
import type { Session } from "next-auth";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { requireAuth, validateXdripSecret, AuthError } from "@/lib/apiHelpers";
import { auth } from "@/lib/auth";
import { sha1 } from "@/lib/xdripDb";

describe("requireAuth", () => {
  const mockAuth = auth as unknown as MockedFunction<() => Promise<Session | null>>;

  it("returns email when session exists", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "test@example.com" },
      expires: "",
    } as Session);
    const email = await requireAuth();
    expect(email).toBe("test@example.com");
  });

  it("throws when no session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireAuth()).rejects.toThrow(AuthError);
  });

  it("throws when session has no email", async () => {
    mockAuth.mockResolvedValue({
      user: {},
      expires: "",
    } as Session);
    await expect(requireAuth()).rejects.toThrow(AuthError);
  });

  it("throws when user is null", async () => {
    mockAuth.mockResolvedValue({
      user: null as never,
      expires: "",
    } as Session);
    await expect(requireAuth()).rejects.toThrow(AuthError);
  });
});

describe("validateXdripSecret", () => {
  const ORIGINAL = process.env.XDRIP_SECRET;
  afterEach(() => {
    if (ORIGINAL !== undefined) {
      process.env.XDRIP_SECRET = ORIGINAL;
    } else {
      delete process.env.XDRIP_SECRET;
    }
  });

  it("accepts pre-hashed secret (xDrip behavior)", () => {
    process.env.XDRIP_SECRET = "mysecret";
    expect(validateXdripSecret(sha1("mysecret"))).toBe(true);
  });

  it("accepts raw secret (SugarRun behavior)", () => {
    process.env.XDRIP_SECRET = "mysecret";
    expect(validateXdripSecret("mysecret")).toBe(true);
  });

  it("rejects wrong secret", () => {
    process.env.XDRIP_SECRET = "mysecret";
    expect(validateXdripSecret("wrong")).toBe(false);
  });

  it("rejects null", () => {
    process.env.XDRIP_SECRET = "mysecret";
    expect(validateXdripSecret(null)).toBe(false);
  });

  it("rejects when XDRIP_SECRET not set", () => {
    delete process.env.XDRIP_SECRET;
    expect(validateXdripSecret("anything")).toBe(false);
  });
});
