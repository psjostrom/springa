import { NextResponse } from "next/server";
import {
  lookupXdripUser,
  getXdripReadings,
  saveXdripReadings,
} from "@/lib/settings";
import { parseNightscoutEntries } from "@/lib/xdrip";

export async function POST(req: Request) {
  const apiSecret = req.headers.get("api-secret");
  if (!apiSecret) {
    return NextResponse.json({ error: "Missing api-secret" }, { status: 401 });
  }

  const email = await lookupXdripUser(apiSecret);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const newReadings = parseNightscoutEntries(body);
  if (newReadings.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  const existing = await getXdripReadings(email);
  const merged = [...existing, ...newReadings];

  // Deduplicate by timestamp
  const seen = new Set<number>();
  const deduped = merged.filter((r) => {
    if (seen.has(r.ts)) return false;
    seen.add(r.ts);
    return true;
  });

  // Sort chronologically
  deduped.sort((a, b) => a.ts - b.ts);

  await saveXdripReadings(email, deduped);

  return NextResponse.json({ ok: true, count: newReadings.length });
}
