import { auth } from "@/lib/auth";
import { fetchWellnessData } from "@/lib/intervalsApi";
import { NextResponse } from "next/server";
import { format, subDays } from "date-fns";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
