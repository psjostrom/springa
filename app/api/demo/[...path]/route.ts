import { NextResponse } from "next/server";
import {
  fixtures,
  activityFixtures,
  streamFixtures,
  coachFixtures,
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
  const snapshot = new Date(SNAPSHOT_DATE + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime() - snapshot.getTime();
}

/** Resolve relative timestamps (negative = ms before now) to absolute. */
function resolveRelativeTimestamps(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map(resolveRelativeTimestamps);
  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (key === "ts" && typeof value === "number" && value < 0) {
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
    const fixture = activityFixtures[path[2]];
    if (!fixture) return NextResponse.json({ error: "Activity not found in demo" }, { status: 404 });
    return NextResponse.json(shiftDates(fixture, dayShiftMs));
  }

  if (path[0] === "intervals" && path[1] === "events" && path[2]) {
    return NextResponse.json({ error: "Not available in demo" }, { status: 404 });
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

  // Streams — POST with activityIds, return fixture stream data
  if (key === "intervals/streams") {
    return NextResponse.json(streamFixtures);
  }

  // Coach chat — return canned response or demo message
  if (key === "chat") {
    const body = await req.json() as {
      messages?: { role: string; parts?: { type: string; text?: string }[]; content?: string }[];
    };
    const lastUserMsg = body.messages
      ?.filter((m) => m.role === "user")
      .pop();
    const question = lastUserMsg?.content
      ?? lastUserMsg?.parts?.filter((p) => p.type === "text").map((p) => p.text).join("")
      ?? "";

    const responseText = coachFixtures[question.trim()]
      ?? "I'm in demo mode — questions beyond the pre-set ones aren't available. Sign in to chat with your personal coach.";

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
