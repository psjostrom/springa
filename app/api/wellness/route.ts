import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { fetchWellnessData } from "@/lib/intervalsApi";
import { NextResponse } from "next/server";
import { format, subDays } from "date-fns";

export async function GET(req: Request) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const apiKey = process.env.INTERVALS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  const url = new URL(req.url);
  const days = Math.min(Number(url.searchParams.get("days")) || 365, 365);
  const today = new Date();
  const oldest = format(subDays(today, days), "yyyy-MM-dd");
  const newest = format(today, "yyyy-MM-dd");

  const rows = await fetchWellnessData(apiKey, oldest, newest);

  // Trim leading days before any training activity
  const firstNonZero = rows.findIndex((r) => (r.ctl ?? 0) > 0 || (r.atl ?? 0) > 0);
  const data = firstNonZero > 0 ? rows.slice(firstNonZero) : rows;

  return NextResponse.json(data);
}
