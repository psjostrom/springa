import { auth } from "@/lib/auth";
import { getRunFeedback, getUserSettings, updateRunFeedback } from "@/lib/settings";
import { API_BASE } from "@/lib/constants";
import { NextResponse } from "next/server";

/** Look up today's planned event and compute prescribed carbs from carbs_per_hour × duration. */
async function computePrescribedCarbs(apiKey: string, durationMs: number, runDate: Date): Promise<number | null> {
  const dateStr = runDate.toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `${API_BASE}/athlete/0/events?oldest=${dateStr}T00:00:00&newest=${dateStr}T23:59:59`,
      { headers: { Authorization: "Basic " + btoa("API_KEY:" + apiKey) } },
    );
    if (!res.ok) return null;
    const events = await res.json();
    const planned = events.find((e: { category: string; carbs_per_hour?: number }) =>
      e.category === "WORKOUT" && e.carbs_per_hour != null,
    );
    if (!planned?.carbs_per_hour) return null;
    return Math.round(planned.carbs_per_hour * (durationMs / 3600000));
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ts = searchParams.get("ts");
  if (!ts) {
    return NextResponse.json({ error: "Missing ts" }, { status: 400 });
  }

  const feedback = await getRunFeedback(session.user.email, Number(ts));
  if (!feedback) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Compute prescribed carbs from the planned event's carbs_per_hour
  let prescribedCarbsG: number | null = null;
  try {
    if (feedback.duration != null) {
      const settings = await getUserSettings(session.user.email);
      if (settings.intervalsApiKey) {
        prescribedCarbsG = await computePrescribedCarbs(
          settings.intervalsApiKey,
          feedback.duration,
          new Date(Number(ts)),
        );
      }
    }
  } catch {
    // Non-critical — just skip prescribed carbs
  }

  return NextResponse.json({ ...feedback, prescribedCarbsG });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { ts, rating, comment, carbsG } = body as {
    ts: number;
    rating: string;
    comment?: string;
    carbsG?: number;
  };

  if (!ts || !rating) {
    return NextResponse.json({ error: "Missing ts or rating" }, { status: 400 });
  }

  await updateRunFeedback(session.user.email, ts, rating, comment, carbsG);
  return NextResponse.json({ ok: true });
}
