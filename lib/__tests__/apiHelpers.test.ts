import { describe, it, expect, vi, afterEach, type MockedFunction } from "vitest";
import type { Session } from "next-auth";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { requireAuth, validateRequest, AuthError } from "@/lib/apiHelpers";
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

describe("validateRequest", () => {
  const ORIGINAL = process.env.CGM_SECRET;
  afterEach(() => {
    if (ORIGINAL !== undefined) {
      process.env.CGM_SECRET = ORIGINAL;
    } else {
      delete process.env.CGM_SECRET;
    }
  });

  it("accepts api-secret header", () => {
    process.env.CGM_SECRET = "mysecret";
    const req = new Request("http://x/api/sgv", { headers: { "api-secret": "mysecret" } });
    expect(validateRequest(req)).toBe(true);
  });

  it("accepts ?token= query param", () => {
    process.env.CGM_SECRET = "mysecret";
    const req = new Request("http://x/api/sgv?token=mysecret");
    expect(validateRequest(req)).toBe(true);
  });

  it("accepts hashed token param", () => {
    process.env.CGM_SECRET = "mysecret";
    const req = new Request("http://x/api/sgv?token=" + sha1("mysecret"));
    expect(validateRequest(req)).toBe(true);
  });

  it("rejects no auth", () => {
    process.env.CGM_SECRET = "mysecret";
    const req = new Request("http://x/api/sgv");
    expect(validateRequest(req)).toBe(false);
  });

  it("rejects wrong token", () => {
    process.env.CGM_SECRET = "mysecret";
    const req = new Request("http://x/api/sgv?token=wrong");
    expect(validateRequest(req)).toBe(false);
  });

  it("accepts pre-hashed header (CGM behavior)", () => {
    process.env.CGM_SECRET = "mysecret";
    const req = new Request("http://x/api/sgv", { headers: { "api-secret": sha1("mysecret") } });
    expect(validateRequest(req)).toBe(true);
  });

  it("rejects wrong header", () => {
    process.env.CGM_SECRET = "mysecret";
    const req = new Request("http://x/api/sgv", { headers: { "api-secret": "wrong" } });
    expect(validateRequest(req)).toBe(false);
  });

  it("rejects when CGM_SECRET not set", () => {
    delete process.env.CGM_SECRET;
    const req = new Request("http://x/api/sgv?token=anything");
    expect(validateRequest(req)).toBe(false);
  });

  it("accepts token when header is wrong", () => {
    process.env.CGM_SECRET = "mysecret";
    const req = new Request("http://x/api/sgv?token=mysecret", { headers: { "api-secret": "wrong" } });
    expect(validateRequest(req)).toBe(true);
  });
});
