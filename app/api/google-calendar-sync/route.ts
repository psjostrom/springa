import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getGoogleCalendarContext,
  clearFutureGoogleEvents,
  syncEventsToGoogle,
  findGoogleEvent,
  getGoogleEventTimes,
  updateGoogleEvent,
  deleteGoogleEvent,
} from "@/lib/googleCalendar";
import { format } from "date-fns";
import type { WorkoutEvent } from "@/lib/types";

interface SyncRequest {
  action: "bulk-sync" | "update" | "delete";
  events?: WorkoutEvent[];
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

  const body = (await req.json()) as SyncRequest;
  const ctx = await getGoogleCalendarContext(session.user.email);
  if (!ctx) {
    return NextResponse.json({ synced: false, reason: "no-token" });
  }

  try {
    if (body.action === "bulk-sync" && body.events) {
      const events = body.events.map((e) => ({
        ...e,
        start_date_local: new Date(e.start_date_local),
      }));
      await clearFutureGoogleEvents(ctx.accessToken, ctx.calendarId);
      await syncEventsToGoogle(ctx.accessToken, ctx.calendarId, events, ctx.timezone);
      return NextResponse.json({ synced: true, count: events.length });
    }

    if (body.action === "update" && body.eventName && body.eventDate) {
      const googleEventId = await findGoogleEvent(ctx.accessToken, ctx.calendarId, body.eventName, body.eventDate);
      if (googleEventId && body.updates) {
        const updates: Record<string, unknown> = {};
        if (body.updates.name) updates.summary = body.updates.name;
        if (body.updates.description) updates.description = body.updates.description;
        if (body.updates.date) {
          // Preserve event duration: fetch existing event to compute new end time
          const times = await getGoogleEventTimes(ctx.accessToken, ctx.calendarId, googleEventId);
          const newStart = new Date(body.updates.date);
          if (times) {
            const durationMs = new Date(times.end).getTime() - new Date(times.start).getTime();
            const newEnd = new Date(newStart.getTime() + durationMs);
            updates.start = { dateTime: body.updates.date, timeZone: ctx.timezone };
            updates.end = { dateTime: format(newEnd, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: ctx.timezone };
          } else {
            updates.start = { dateTime: body.updates.date, timeZone: ctx.timezone };
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
