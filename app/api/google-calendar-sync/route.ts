import { NextResponse } from "next/server";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import {
  getGoogleCalendarContext,
  clearFutureGoogleEvents,
  syncEventsToGoogle,
  findGoogleEvent,
  getGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from "@/lib/googleCalendar";
import type { SyncEvent } from "@/lib/googleCalendar";

// Strip a trailing TZ offset (`+02:00` or `Z`) so the wall-clock can be parsed
// as a naive Date for delta math. We never compare absolute instants here.
function toWallClock(dateTime: string): Date {
  return new Date(dateTime.replace(/([+-]\d{2}:\d{2}|Z)$/, ""));
}

interface SyncRequest {
  action: "bulk-sync" | "update" | "delete";
  events?: SyncEvent[];
  eventName?: string;
  eventDate?: string;
  updates?: {
    name?: string;
    date?: string;
    description?: string;
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as SyncRequest;
    const ctx = await getGoogleCalendarContext(session.user.email);
    if (!ctx) {
      return NextResponse.json({ synced: false, reason: "no-token" });
    }

    if (body.action === "bulk-sync" && body.events) {
      await clearFutureGoogleEvents(ctx.accessToken, ctx.calendarId);
      await syncEventsToGoogle(ctx.accessToken, ctx.calendarId, body.events, ctx.timezone);
      return NextResponse.json({ synced: true, count: body.events.length });
    }

    if (body.action === "update" && body.eventName && body.eventDate) {
      const googleEventId = await findGoogleEvent(ctx.accessToken, ctx.calendarId, body.eventName, body.eventDate);
      if (googleEventId && body.updates) {
        const updates: Record<string, unknown> = {};
        if (body.updates.name) updates.summary = body.updates.name;
        if (body.updates.description) updates.description = body.updates.description;
        if (body.updates.date) {
          // Shift end by the same delta as start so the duration is preserved.
          // Without this, Google leaves the original end alone and a 1h event
          // dragged across days becomes a multi-day event.
          const newStart = body.updates.date;
          updates.start = { dateTime: newStart, timeZone: ctx.timezone };

          const existing = await getGoogleEvent(ctx.accessToken, ctx.calendarId, googleEventId);
          if (existing) {
            const oldStart = toWallClock(existing.start.dateTime);
            const oldEnd = toWallClock(existing.end.dateTime);
            const durationMs = oldEnd.getTime() - oldStart.getTime();
            const newEnd = new Date(toWallClock(newStart).getTime() + durationMs);
            updates.end = {
              dateTime: format(newEnd, "yyyy-MM-dd'T'HH:mm:ss"),
              timeZone: ctx.timezone,
            };
          }
        }
        await updateGoogleEvent(ctx.accessToken, ctx.calendarId, googleEventId, updates);
      }
      return NextResponse.json({ synced: true });
    }

    if (body.action === "delete" && body.eventName && body.eventDate) {
      const googleEventId = await findGoogleEvent(ctx.accessToken, ctx.calendarId, body.eventName, body.eventDate);
      if (googleEventId) {
        await deleteGoogleEvent(ctx.accessToken, ctx.calendarId, googleEventId);
      }
      return NextResponse.json({ synced: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("Google Calendar sync error:", e);
    return NextResponse.json({ synced: false, error: String(e) });
  }
}
