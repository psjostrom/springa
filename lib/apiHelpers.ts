import { NextResponse } from "next/server";
import { auth } from "./auth";

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
  }
}

/** Get authenticated user email or throw AuthError. */
export async function requireAuth(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new AuthError();
  return email;
}

/** Standard 401 response for auth failures. */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
