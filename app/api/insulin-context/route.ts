import { requireAuth, getMyLifeData, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { buildInsulinContext } from "@/lib/insulinContext";
import { NextResponse } from "next/server";

export async function GET() {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.mylifeEmail || !creds.mylifePassword) {
    return NextResponse.json(null);
  }

  const data = await getMyLifeData(creds.mylifeEmail, creds.mylifePassword, creds.timezone);
  if (!data) return NextResponse.json(null);

  try {
    const ctx = buildInsulinContext(data, Date.now());
    return NextResponse.json(ctx);
  } catch (err) {
    console.error("[insulin-context] buildInsulinContext failed:", err);
    return NextResponse.json(null);
  }
}
