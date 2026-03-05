import { auth } from "@/lib/auth";
import { getXdripReadingsForRun } from "@/lib/xdripDb";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const readings = await getXdripReadingsForRun(session.user.email, start, end);

  return NextResponse.json({ readings });
}
