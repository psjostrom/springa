import { NextResponse } from "next/server";
import { auth } from "./auth";
import { signIn as mylifeSignIn, fetchMyLifeData, clearSession as clearMyLifeSession } from "./mylife";
import type { MyLifeData } from "./mylife";

export { validateApiSecretFromDB } from "./credentials";

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

/** Fetch MyLife data with explicit credentials. */
export async function getMyLifeData(
  email: string,
  password: string,
  tz: string,
): Promise<MyLifeData | null> {
  try {
    const session = await mylifeSignIn(email, password);
    return await fetchMyLifeData(session, tz);
  } catch (err) {
    console.error("[mylife] Failed:", err);
    clearMyLifeSession(email);
    return null;
  }
}

/** Standard 401 response for auth failures. */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
