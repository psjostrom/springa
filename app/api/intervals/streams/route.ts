import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchStreamBatch } from "@/lib/intervalsApi";

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const body = (await req.json()) as { activityIds?: string[] };
  const activityIds = body.activityIds;

  if (!Array.isArray(activityIds) || activityIds.length === 0) {
    return NextResponse.json({ error: "Missing or invalid activityIds" }, { status: 400 });
  }

  const ids = activityIds.slice(0, 50);

  try {
    const streamMap = await fetchStreamBatch(creds.intervalsApiKey, ids, 3);
    const result = Object.fromEntries(streamMap);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[intervals/streams]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch streams" },
      { status: 502 },
    );
  }
}
