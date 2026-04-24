import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { savePushSubscription } from "@/lib/pushDb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = (await req.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await savePushSubscription(email, {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });

  return NextResponse.json({ ok: true });
}
