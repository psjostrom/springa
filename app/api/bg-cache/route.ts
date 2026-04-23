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

  try {
    const cache = await getActivityStreams(email);
    return NextResponse.json(cache);
  } catch (err) {
    console.error("Failed to load BG cache:", err);
    return NextResponse.json({ error: "Failed to load BG cache" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Expected an array of cached activities" }, { status: 400 });
  }

  try {
    await saveActivityStreams(email, body as CachedActivity[]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to save BG cache:", err);
    return NextResponse.json({ error: "Failed to save BG cache" }, { status: 500 });
  }
}
