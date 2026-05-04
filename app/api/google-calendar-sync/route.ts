import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getGoogleCalendarContext,
  clearFutureGoogleEvents,
  syncEventsToGoogle,
  buildGoogleCalendarEventPayload,
  findGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from "@/lib/googleCalendar";
import type { SyncEvent } from "@/lib/googleCalendar";
import { getUserCredentials } from "@/lib/credentials";
import { getUserSettings } from "@/lib/settings";
import { getUserWorkoutEstimationContext } from "@/lib/workoutEstimationContext";

interface SyncRequest {
  action: "bulk-sync" | "update" | "delete";
  events?: SyncEvent[];
  eventName?: string;
  eventDate?: string;
  event?: SyncEvent;
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

    const [settings, creds] = await Promise.all([
      getUserSettings(session.user.email),
      getUserCredentials(session.user.email),
    ]);
    const workoutContext = await getUserWorkoutEstimationContext(
      session.user.email,
      creds?.intervalsApiKey,
      settings,
    );

    if (body.action === "bulk-sync" && body.events) {
      await clearFutureGoogleEvents(ctx.accessToken, ctx.calendarId);
      await syncEventsToGoogle(
        ctx.accessToken,
        ctx.calendarId,
        body.events,
        ctx.timezone,
        workoutContext,
      );
      return NextResponse.json({ synced: true, count: body.events.length });
    }

    if (body.action === "update" && body.eventName && body.eventDate && body.event) {
      const googleEventId = await findGoogleEvent(ctx.accessToken, ctx.calendarId, body.eventName, body.eventDate);
      if (googleEventId) {
        const updates = buildGoogleCalendarEventPayload(body.event, ctx.timezone, workoutContext);
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
