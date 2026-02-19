import { auth } from "@/lib/auth";
import { getUserSettings, saveUserSettings, UserSettings } from "@/lib/settings";
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
  await saveUserSettings(session.user.email, body);
  return NextResponse.json({ ok: true });
}
