import { requireAuth, getMyLifeData, unauthorized, AuthError } from "@/lib/apiHelpers";
import { buildInsulinContext } from "@/lib/insulinContext";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const data = await getMyLifeData();
  if (!data) return NextResponse.json(null);

  try {
    const ctx = buildInsulinContext(data, Date.now());
    return NextResponse.json(ctx);
  } catch (err) {
    console.error("[insulin-context] buildInsulinContext failed:", err);
    return NextResponse.json(null);
  }
}
