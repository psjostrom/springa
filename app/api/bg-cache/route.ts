import { auth } from "@/lib/auth";
import { getActivityStreams, saveActivityStreams, type CachedActivity } from "@/lib/activityStreamsDb";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cache = await getActivityStreams(session.user.email);
  return NextResponse.json(cache);
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CachedActivity[];
  await saveActivityStreams(session.user.email, body);
  return NextResponse.json({ ok: true });
}
