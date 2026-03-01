import { auth } from "@/lib/auth";
import { getRatedActivityIds } from "@/lib/feedbackDb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { activityIds?: string[] };
  const { activityIds } = body;

  if (!Array.isArray(activityIds) || activityIds.length === 0) {
    return NextResponse.json({ ratedIds: [] });
  }

  const ratedSet = await getRatedActivityIds(session.user.email, activityIds);
  return NextResponse.json({ ratedIds: [...ratedSet] });
}
