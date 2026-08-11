import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "./auth";
import { verifyMobileToken } from "./mobileAuth";
import type { WorkoutReplacementErrorCode } from "./workoutReplacement";

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
  }
}

export type AuthSource = "session" | "bearer";

export interface AuthenticatedUser {
  email: string;
  source: AuthSource;
}

interface RequireAuthOptions {
  /** Explicit request headers for route handlers; defaults to Next.js headers. */
  headerList?: Headers;
  withSource?: boolean;
}

/** Get authenticated user email or throw AuthError. */
export async function requireAuth(
  options: RequireAuthOptions & { withSource: true },
): Promise<AuthenticatedUser>;
export async function requireAuth(
  options?: RequireAuthOptions & { withSource?: false },
): Promise<string>;
export async function requireAuth(
  options?: RequireAuthOptions,
): Promise<string | AuthenticatedUser> {
  const session = await auth();
  const cookieEmail = session?.user?.email;
  if (cookieEmail) {
    const result = { email: cookieEmail, source: "session" as const };
    return options?.withSource ? result : result.email;
  }

  const headerList = options?.headerList ?? (await headers());
  const authorization = headerList.get("authorization");
  if (authorization && /^Bearer\s+/i.test(authorization)) {
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      try {
        const { email } = await verifyMobileToken(token);
        const result = { email, source: "bearer" as const };
        return options?.withSource ? result : result.email;
      } catch {
        throw new AuthError();
      }
    }
  }

  throw new AuthError();
}

export function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export function replacementErrorStatus(code: WorkoutReplacementErrorCode): number {
  switch (code) {
    case "EVENT_NOT_FOUND":
      return 404;
    case "UNSUPPORTED_EVENT":
    case "PLAN_SETTINGS_REQUIRED":
    case "DATE_OUTSIDE_PLAN":
      return 422;
    case "LOCAL_CLEANUP_FAILED":
      return 500;
    case "UPSTREAM_ERROR":
      return 502;
  }
}

/** Standard 401 response for auth failures. */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
