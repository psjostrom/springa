import { auth } from "@/lib/auth";
import { getRunFeedback, updateRunFeedback } from "@/lib/settings";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ts = searchParams.get("ts");
  if (!ts) {
    return NextResponse.json({ error: "Missing ts" }, { status: 400 });
  }

  const feedback = await getRunFeedback(session.user.email, Number(ts));
  if (!feedback) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(feedback);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { ts, rating, comment, carbsG } = body as {
    ts: number;
    rating: string;
    comment?: string;
    carbsG?: number;
  };

  if (!ts || !rating) {
    return NextResponse.json({ error: "Missing ts or rating" }, { status: 400 });
  }

  await updateRunFeedback(session.user.email, ts, rating, comment, carbsG);
  return NextResponse.json({ ok: true });
}
