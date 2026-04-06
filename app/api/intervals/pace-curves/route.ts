import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchPaceCurves } from "@/lib/intervalsApi";

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const curveId = url.searchParams.get("curve") ?? "all";

  try {
    const result = await fetchPaceCurves(creds.intervalsApiKey, curveId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[intervals/pace-curves]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch pace curves" },
      { status: 502 },
    );
  }
}
