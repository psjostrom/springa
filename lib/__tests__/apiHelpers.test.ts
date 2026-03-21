import { describe, it, expect, vi, afterEach, type MockedFunction } from "vitest";
import type { Session } from "next-auth";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { requireAuth, validateApiSecret, AuthError } from "@/lib/apiHelpers";
import { auth } from "@/lib/auth";
import { sha1 } from "@/lib/bgDb";

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

describe("validateApiSecret", () => {
  const ORIGINAL = process.env.CGM_SECRET;
  afterEach(() => {
    if (ORIGINAL !== undefined) {
      process.env.CGM_SECRET = ORIGINAL;
    } else {
      delete process.env.CGM_SECRET;
    }
  });

  it("accepts pre-hashed secret (CGM behavior)", () => {
    process.env.CGM_SECRET = "mysecret";
    expect(validateApiSecret(sha1("mysecret"))).toBe(true);
  });

  it("accepts raw secret (SugarRun behavior)", () => {
    process.env.CGM_SECRET = "mysecret";
    expect(validateApiSecret("mysecret")).toBe(true);
  });

  it("rejects wrong secret", () => {
    process.env.CGM_SECRET = "mysecret";
    expect(validateApiSecret("wrong")).toBe(false);
  });

  it("rejects null", () => {
    process.env.CGM_SECRET = "mysecret";
    expect(validateApiSecret(null)).toBe(false);
  });

  it("rejects when CGM_SECRET not set", () => {
    delete process.env.CGM_SECRET;
    expect(validateApiSecret("anything")).toBe(false);
  });

  it("accepts valid token param when header is null", () => {
    process.env.CGM_SECRET = "mysecret";
    expect(validateApiSecret(null, "mysecret")).toBe(true);
  });

  it("accepts pre-hashed token param", () => {
    process.env.CGM_SECRET = "mysecret";
    expect(validateApiSecret(null, sha1("mysecret"))).toBe(true);
  });

  it("rejects wrong token param", () => {
    process.env.CGM_SECRET = "mysecret";
    expect(validateApiSecret(null, "wrong")).toBe(false);
  });

  it("accepts when header wrong but token valid", () => {
    process.env.CGM_SECRET = "mysecret";
    expect(validateApiSecret("wrong", "mysecret")).toBe(true);
  });

  it("rejects when both header and token are null", () => {
    process.env.CGM_SECRET = "mysecret";
    expect(validateApiSecret(null, null)).toBe(false);
  });
});
