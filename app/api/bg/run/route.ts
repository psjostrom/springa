import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getBGReadingsForRun } from "@/lib/bgDb";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const startMs = searchParams.get("start");
  const endMs = searchParams.get("end");

  if (!startMs || !endMs) {
    return NextResponse.json(
      { error: "Missing start or end parameter" },
      { status: 400 },
    );
  }

  const start = parseInt(startMs, 10);
  const end = parseInt(endMs, 10);

  if (isNaN(start) || isNaN(end) || start >= end) {
    return NextResponse.json(
      { error: "Invalid start or end parameter" },
      { status: 400 },
    );
  }

  const readings = await getBGReadingsForRun(email, start, end);

  return NextResponse.json({ readings });
}
