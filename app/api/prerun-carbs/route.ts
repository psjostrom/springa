import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { parseCalendarEventId } from "@/lib/calendarEventId";
import {
  deletePreRunCarbs,
  getPreRunCarbs,
  savePreRunCarbs,
} from "@/lib/prerunCarbs";
import { NextResponse } from "next/server";

function invalidInput(error: string) {
  return NextResponse.json(
    { error, code: "INVALID_INPUT" },
    { status: 400 },
  );
}

export async function GET(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const rawEventId = searchParams.get("eventId");
  const eventId = parseCalendarEventId(rawEventId);

  if (eventId == null) {
    return invalidInput(rawEventId ? "Invalid eventId" : "Missing eventId");
  }

  try {
    return NextResponse.json({ carbsG: await getPreRunCarbs(email, eventId) });
  } catch (err) {
    console.error("Failed to load pre-run carbs:", err);
    return NextResponse.json({ error: "Failed to load pre-run carbs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return invalidInput("Invalid input");
  }

  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "eventId" && key !== "carbsG")) {
    return invalidInput("Unknown field");
  }

  const eventId = parseCalendarEventId(input.eventId);
  if (eventId == null) {
    return invalidInput(
      Object.hasOwn(input, "eventId") ? "Invalid eventId" : "Missing eventId",
    );
  }

  if (!Object.hasOwn(input, "carbsG")) {
    return invalidInput("Missing carbsG");
  }
  const carbsG = input.carbsG;
  if (
    carbsG !== null &&
    (typeof carbsG !== "number" ||
      !Number.isFinite(carbsG) ||
      !Number.isInteger(carbsG) ||
      carbsG < 0)
  ) {
    return invalidInput("Invalid carbsG");
  }

  try {
    await savePreRunCarbs(email, eventId, carbsG);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to save pre-run carbs:", err);
    return NextResponse.json({ error: "Failed to save pre-run carbs" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  let email: string;
  try {
    email = await requireAuth({ headerList: req.headers });
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const rawEventId = searchParams.get("eventId");
  const eventId = parseCalendarEventId(rawEventId);

  if (eventId == null) {
    return invalidInput(rawEventId ? "Invalid eventId" : "Missing eventId");
  }

  try {
    await deletePreRunCarbs(email, eventId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete pre-run carbs:", err);
    return NextResponse.json({ error: "Failed to delete pre-run carbs" }, { status: 500 });
  }
}
