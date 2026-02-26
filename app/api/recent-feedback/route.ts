import { auth } from "@/lib/auth";
import { getRecentFeedback } from "@/lib/feedbackDb";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feedback = await getRecentFeedback(session.user.email);
  return NextResponse.json(feedback);
}
