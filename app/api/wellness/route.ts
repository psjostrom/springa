import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchWellnessData } from "@/lib/intervalsApi";
import { NextResponse } from "next/server";
import { format, subDays } from "date-fns";

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
  const days = Math.min(Number(url.searchParams.get("days")) || 365, 365);
  const today = new Date();
  const oldest = format(subDays(today, days), "yyyy-MM-dd");
  const newest = format(today, "yyyy-MM-dd");

  const rows = await fetchWellnessData(creds.intervalsApiKey, oldest, newest);

  // Trim leading days before any training activity
  const firstNonZero = rows.findIndex((r) => (r.ctl ?? 0) > 0 || (r.atl ?? 0) > 0);
  const data = firstNonZero > 0 ? rows.slice(firstNonZero) : rows;

  return NextResponse.json(data);
}
