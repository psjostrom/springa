import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "./auth";
import { verifyMobileToken } from "./mobileAuth";

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
  }
}

/** Get authenticated user email or throw AuthError. */
export async function requireAuth(options?: {
  /** Test override — production always reads Next.js request headers. */
  headerList?: Headers;
}): Promise<string> {
  const session = await auth();
  const cookieEmail = session?.user?.email;
  if (cookieEmail) return cookieEmail;

  const headerList = options?.headerList ?? (await headers());
  const authorization = headerList.get("authorization");
  if (authorization && /^Bearer\s+/i.test(authorization)) {
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      try {
        const { email } = await verifyMobileToken(token);
        return email;
      } catch {
        throw new AuthError();
      }
    }
  }

  throw new AuthError();
}

/** Standard 401 response for auth failures. */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
