import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchActivityById, fetchActivityDetails, deleteActivity, authHeader } from "@/lib/intervalsApi";
import { API_BASE } from "@/lib/constants";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const streams = url.searchParams.get("streams") === "1";

  try {
    if (streams) {
      const result = await fetchActivityDetails(id, creds.intervalsApiKey);
      return NextResponse.json(result);
    } else {
      const result = await fetchActivityById(creds.intervalsApiKey, id);
      return NextResponse.json(result);
    }
  } catch (err) {
    console.error("[intervals/activity]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch activity" },
      { status: 502 },
    );
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;

  try {
    const res = await fetch(`${API_BASE}/activity/${id}`, {
      method: "PUT",
      headers: { Authorization: authHeader(creds.intervalsApiKey), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Intervals.icu ${res.status}: ${text}`);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[intervals/activity] PUT", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update activity" },
      { status: 502 },
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const { id } = await params;

  try {
    await deleteActivity(creds.intervalsApiKey, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[intervals/activity]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete activity" },
      { status: 502 },
    );
  }
}
