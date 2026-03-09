import { auth } from "@/lib/auth";
import { signIn as mylifeSignIn, fetchMyLifeData, clearSession as clearMyLifeSession } from "@/lib/mylife";
import { buildInsulinContext } from "@/lib/insulinContext";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = process.env.MYLIFE_EMAIL;
  const password = process.env.MYLIFE_PASSWORD;
  const tz = process.env.TIMEZONE ?? "Europe/Stockholm";

  if (!email || !password) {
    return NextResponse.json(null);
  }

  try {
    const mylifeSession = await mylifeSignIn(email, password);
    const data = await fetchMyLifeData(mylifeSession, tz);
    const ctx = buildInsulinContext(data, Date.now());
    return NextResponse.json(ctx);
  } catch (err) {
    console.error("[insulin-context] Failed:", err);
    clearMyLifeSession(email);
    return NextResponse.json(null);
  }
}
