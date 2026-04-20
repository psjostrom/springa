import { NextResponse } from "next/server";

export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const response = NextResponse.redirect(new URL("/", origin));
  response.cookies.set("springa-demo", "1", {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
  });
  return response;
}
