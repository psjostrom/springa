import { NextResponse } from "next/server";
import {
  fixtures,
  activityFixtures,
  activityDetailsFixtures,
  streamFixtures,
  coachFixtures,
  bgFixture,
  perRunBGFixtures,
  SNAPSHOT_DATE,
} from "@/lib/demo/fixtures";

interface Params { params: Promise<{ path: string[] }> }

/** Shift all date strings and timestamps in a value by dayShift days. */
function shiftDates(data: unknown, dayShiftMs: number): unknown {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map((item) => shiftDates(item, dayShiftMs));
  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        // ISO date string — shift by days
        const d = new Date(value);
        d.setTime(d.getTime() + dayShiftMs);
        result[key] = d.toISOString().slice(0, value.length);
      } else if (typeof value === "number" && key === "ts") {
        // Timestamp field — shift by ms
        result[key] = value + dayShiftMs;
      } else {
        result[key] = shiftDates(value, dayShiftMs);
      }
    }
    return result;
  }
  return data;
}

function getDayShiftMs(): number {
  const snapshot = new Date(SNAPSHOT_DATE + "T00:00:00Z");
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return todayUtc.getTime() - snapshot.getTime();
}

/** Resolve relative timestamps (negative = ms before now) to absolute. */
const RELATIVE_TS_KEYS = new Set(["ts", "updated"]);
function resolveRelativeTimestamps(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map(resolveRelativeTimestamps);
  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (RELATIVE_TS_KEYS.has(key) && typeof value === "number" && value < 0) {
        result[key] = Date.now() + value;
      } else {
        result[key] = resolveRelativeTimestamps(value);
      }
    }
    return result;
  }
  return data;
}

export async function GET(_req: Request, { params }: Params) {
  const { path } = await params;
  const key = path.join("/");
  const dayShiftMs = getDayShiftMs();

  // Parameterized routes
  if (path[0] === "intervals" && path[1] === "activity" && path[2]) {
    const url = new URL(_req.url);
    if (url.searchParams.get("streams") === "1") {
      const details = activityDetailsFixtures[path[2]];
      if (!details) return NextResponse.json({ streamData: {} });
      return NextResponse.json(details);
    }
    const fixture = activityFixtures[path[2]];
    if (!fixture) return NextResponse.json({});
    return NextResponse.json(shiftDates(fixture, dayShiftMs));
  }

  if (path[0] === "intervals" && path[1] === "events" && path[2]) {
    return NextResponse.json({ error: "Not available in demo" }, { status: 404 });
  }

  // Per-run BG readings — look up by activity ID from calendar, fallback to 24h fixture
  if (key === "bg/run") {
    const url = new URL(_req.url);
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");
    if (!startParam || !endParam) {
      return NextResponse.json({ error: "Missing start or end parameter" }, { status: 400 });
    }
    const startMs = Number(startParam);
    const endMs = Number(endParam);
    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
      return NextResponse.json({ error: "Invalid start or end parameter" }, { status: 400 });
    }
    const dayShift = getDayShiftMs();

    // Find the activity whose date matches this time window
    const cal = fixtures["intervals/calendar"] as { date: string; activityId?: string }[] | undefined;
    const matchedEvent = cal?.find((e) =>
      e.activityId && Math.abs(new Date(e.date).getTime() + dayShift - startMs) < 30 * 60 * 1000,
    );
    const bgReadingsForRun = matchedEvent?.activityId
      ? perRunBGFixtures[matchedEvent.activityId] as { ts: number }[] | undefined
      : undefined;

    if (bgReadingsForRun) {
      const readings = bgReadingsForRun.map((r) => ({
        ...r,
        ts: r.ts + dayShift,
      }));
      return NextResponse.json({ readings });
    }

    // Fallback: filter from 24h BG fixture
    const bgData = bgFixture as { readings?: { ts: number }[] };
    const allReadings = (bgData.readings ?? []).map((r) => ({
      ...r,
      ts: r.ts < 0 ? Date.now() + r.ts : r.ts,
    }));
    const filtered = allReadings.filter((r) => r.ts >= startMs && r.ts <= endMs);
    return NextResponse.json({ readings: filtered });
  }

  // BG data uses relative timestamps — resolve to absolute
  if (key === "bg" || key === "insulin-context") {
    const fixture = fixtures[key];
    if (!fixture) return NextResponse.json({ error: "Not available in demo" }, { status: 404 });
    return NextResponse.json(resolveRelativeTimestamps(fixture));
  }

  // Settings — no date shifting needed
  if (key === "settings") {
    return NextResponse.json(fixtures[key]);
  }

  // Default: exact match with date shifting
  const fixture = fixtures[key];
  if (!fixture) {
    return NextResponse.json({ error: "Not available in demo" }, { status: 404 });
  }
  return NextResponse.json(shiftDates(fixture, dayShiftMs));
}

export async function POST(req: Request, { params }: Params) {
  const { path } = await params;
  const key = path.join("/");

  // Run analysis — return canned demo analysis
  if (key === "run-analysis") {
    return NextResponse.json({
      analysis: "**Demo Mode** — This is a preview of the AI run analysis feature. In the full app, each completed run gets a personalized breakdown covering BG response, pacing, fueling, and recommendations for your next session.\n\nSign in to see your real analysis.",
    });
  }

  // Streams — POST with activityIds, return fixture stream data
  if (key === "intervals/streams") {
    return NextResponse.json(streamFixtures);
  }

  // Coach chat — return canned response for suggestion buttons, demo message for freeform
  if (key === "chat") {
    const body = await req.json() as {
      messages?: { role: string; parts?: { type: string; text?: string }[]; content?: string }[];
    };

    // First message = suggestion button click, subsequent = freeform follow-up
    const messageCount = body.messages?.filter((m) => m.role === "user").length ?? 0;
    const lastUserMsg = body.messages
      ?.filter((m) => m.role === "user")
      .pop();
    const question = lastUserMsg?.content
      ?? lastUserMsg?.parts?.filter((p) => p.type === "text").map((p) => p.text).join("")
      ?? "";

    // Try exact match first, then fall back to first canned response for single-message chats
    const demoFallback = "I'm in demo mode — this is a live preview with pre-generated data. Sign in to chat with your personal AI coach.";
    const cannedKeys = Object.keys(coachFixtures);
    let responseText = coachFixtures[question.trim()];
    if (!responseText && messageCount <= 1 && cannedKeys[0]) {
      responseText = coachFixtures[cannedKeys[0]];
    }
    if (!responseText) responseText = demoFallback;

    // Stream the response to match the real /api/chat format (text stream)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(responseText));
        controller.close();
      },
    });

    // TextStreamChatTransport expects a plain text stream — no special headers.
    // Do NOT set X-Vercel-AI-Data-Stream — that triggers the data stream protocol parser.
    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // All other mutations — swallow silently
  return NextResponse.json({ ok: true, demo: true });
}

export function PUT() {
  return NextResponse.json({ ok: true, demo: true });
}

export function DELETE() {
  return NextResponse.json({ ok: true, demo: true });
}
