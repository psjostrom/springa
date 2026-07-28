import { describe, it, expect } from "vitest";
import {
  isLocalQaAllowed,
  verifyQaToken,
  getQaAuthEmail,
  safeQaRedirect,
} from "../qaAuth";

const base = {
  NODE_ENV: "development",
  QA_AUTH_TOKEN: "test-token-exactly-32chars!!",
  QA_AUTH_EMAIL: "qa@example.com",
  AUTH_URL: "http://localhost:3000",
} as NodeJS.ProcessEnv;

describe("isLocalQaAllowed", () => {
  it("allows local development with token and email", () => {
    expect(isLocalQaAllowed(base)).toBe(true);
  });

  it("blocks Vercel production", () => {
    expect(
      isLocalQaAllowed({ ...base, VERCEL_ENV: "production" }),
    ).toBe(false);
  });

  it("blocks NODE_ENV production", () => {
    expect(isLocalQaAllowed({ ...base, NODE_ENV: "production" })).toBe(false);
  });

  it("blocks springa.run AUTH_URL", () => {
    expect(
      isLocalQaAllowed({ ...base, AUTH_URL: "https://www.springa.run" }),
    ).toBe(false);
  });

  it("blocks springa.run subdomains", () => {
    expect(
      isLocalQaAllowed({ ...base, AUTH_URL: "https://preview.springa.run" }),
    ).toBe(false);
  });

  it("blocks springa.run hosts with a trailing DNS dot", () => {
    expect(
      isLocalQaAllowed({ ...base, AUTH_URL: "https://springa.run." }),
    ).toBe(false);
    expect(
      isLocalQaAllowed({ ...base, AUTH_URL: "https://preview.springa.run." }),
    ).toBe(false);
  });

  it("blocks springa.run NEXTAUTH_URL when AUTH_URL unset", () => {
    const envWithoutAuthUrl: NodeJS.ProcessEnv = {
      NODE_ENV: base.NODE_ENV,
      QA_AUTH_TOKEN: base.QA_AUTH_TOKEN,
      QA_AUTH_EMAIL: base.QA_AUTH_EMAIL,
      NEXTAUTH_URL: "https://springa.run",
    };
    expect(isLocalQaAllowed(envWithoutAuthUrl)).toBe(false);
  });

  it("blocks when NEXTAUTH_URL is springa.run even if AUTH_URL is local", () => {
    expect(
      isLocalQaAllowed({
        ...base,
        AUTH_URL: "http://localhost:3000",
        NEXTAUTH_URL: "https://www.springa.run",
      }),
    ).toBe(false);
  });

  it("blocks springa.run hosts that include URL userinfo", () => {
    expect(
      isLocalQaAllowed({
        ...base,
        AUTH_URL: "https://user:pass@preview.springa.run/path",
      }),
    ).toBe(false);
  });

  it("rejects malformed AUTH_URL", () => {
    expect(isLocalQaAllowed({ ...base, AUTH_URL: "not a url" })).toBe(false);
  });

  it("blocks missing token or email", () => {
    expect(isLocalQaAllowed({ ...base, QA_AUTH_TOKEN: "" })).toBe(false);
    expect(isLocalQaAllowed({ ...base, QA_AUTH_EMAIL: undefined })).toBe(false);
  });
});

describe("safeQaRedirect", () => {
  const origin = "http://localhost:3000";

  it("preserves same-origin relative redirects", () => {
    expect(safeQaRedirect("/planner", origin)).toBe("/planner");
    expect(safeQaRedirect("/x?y=1#z", origin)).toBe("/x?y=1#z");
  });

  it("rejects backslashes including decoded %5C", () => {
    // URLSearchParams.get already decodes %5C → \
    expect(safeQaRedirect("/\\evil", origin)).toBe("/");
    expect(safeQaRedirect("/%5Cevil", origin)).toBe("/");
  });

  it("rejects protocol-relative and absolute external URLs", () => {
    expect(safeQaRedirect("//evil.example", origin)).toBe("/");
    expect(safeQaRedirect("https://evil.example/", origin)).toBe("/");
  });

  it("falls back to / for empty or invalid input", () => {
    expect(safeQaRedirect("", origin)).toBe("/");
  });
});

describe("verifyQaToken", () => {
  it("accepts the configured token", () => {
    expect(verifyQaToken(base.QA_AUTH_TOKEN, base)).toBe(true);
  });

  it("rejects wrong or missing tokens", () => {
    expect(verifyQaToken("wrong-token-exactly-32chars!!!", base)).toBe(false);
    expect(verifyQaToken(null, base)).toBe(false);
    expect(verifyQaToken("short", base)).toBe(false);
  });

  it("rejects when QA is not allowed", () => {
    expect(
      verifyQaToken(base.QA_AUTH_TOKEN, {
        ...base,
        VERCEL_ENV: "production",
      }),
    ).toBe(false);
  });
});

describe("getQaAuthEmail", () => {
  it("returns lowercased email when allowed", () => {
    expect(
      getQaAuthEmail({ ...base, QA_AUTH_EMAIL: "QA@Example.COM" }),
    ).toBe("qa@example.com");
  });

  it("returns null when not allowed", () => {
    expect(getQaAuthEmail({ ...base, NODE_ENV: "production" })).toBeNull();
  });
});
