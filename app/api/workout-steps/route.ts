import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/apiHelpers";
import { validateApiSecretFromDB, getUserCredentials } from "@/lib/credentials";
import { API_BASE } from "@/lib/constants";
import { authHeader } from "@/lib/intervalsApi";
import { resolveTimezone, todayInTimezone } from "@/lib/intervalsHelpers";
import { extractStepTotals } from "@/lib/descriptionParser";

export async function GET(req: Request) {
  const email = await validateApiSecretFromDB(req.headers.get("api-secret"));
  if (!email) return unauthorized();

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "No API key configured" }, { status: 500 });
  }

  const tz = resolveTimezone(creds.timezone);
  const today = todayInTimezone(tz);

  const res = await fetch(
    `${API_BASE}/athlete/0/events?oldest=${today}T00:00:00&newest=${today}T23:59:59&category=WORKOUT`,
    { headers: { Authorization: authHeader(creds.intervalsApiKey) } },
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 502 });
  }

  interface EventEntry { description?: string }
  const events = (await res.json()) as EventEntry[];

  const merged: Record<string, number> = {};
  for (const e of events) {
    if (!e.description) continue;
    const totals = extractStepTotals(e.description);
    for (const [name, count] of Object.entries(totals)) {
      merged[name] = (merged[name] ?? 0) + count;
    }
  }

  return NextResponse.json(merged);
}
