import { NextResponse } from "next/server";

export function GET() {
  const response = NextResponse.redirect(new URL("/", process.env.AUTH_URL ?? "http://localhost:3000"));
  response.cookies.set("springa-demo", "1", {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
  });
  return response;
}
