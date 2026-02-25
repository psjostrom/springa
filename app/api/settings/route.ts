import { auth } from "@/lib/auth";
import {
  getUserSettings,
  saveUserSettings,
  type UserSettings,
} from "@/lib/settings";
import { saveXdripAuth } from "@/lib/xdripDb";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings(session.user.email);
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Partial<UserSettings>;

  // xDrip secret needs special handling for reverse auth mapping
  if (body.xdripSecret) {
    await saveXdripAuth(session.user.email, body.xdripSecret);
    delete body.xdripSecret;
  }

  if (Object.keys(body).length > 0) {
    await saveUserSettings(session.user.email, body);
  }

  return NextResponse.json({ ok: true });
}
