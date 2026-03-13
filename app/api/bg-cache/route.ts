import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getActivityStreams, saveActivityStreams, type CachedActivity } from "@/lib/activityStreamsDb";
import { NextResponse } from "next/server";

export async function GET() {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const cache = await getActivityStreams(email);
  return NextResponse.json(cache);
}

export async function PUT(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const body = (await req.json()) as CachedActivity[];
  await saveActivityStreams(email, body);
  return NextResponse.json({ ok: true });
}
