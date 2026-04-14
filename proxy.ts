import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isDemo = req.cookies.get("springa-demo")?.value === "1";

  // Demo mode: rewrite API routes to the demo catch-all
  if (isDemo && nextUrl.pathname.startsWith("/api/") && !nextUrl.pathname.startsWith("/api/auth")) {
    const demoPath = nextUrl.pathname.replace(/^\/api\//, "/api/demo/");
    const url = nextUrl.clone();
    url.pathname = demoPath;
    return NextResponse.rewrite(url);
  }

  // Demo users skip auth redirects — they get data from fixtures
  if (isDemo) {
    return NextResponse.next();
  }

  if (nextUrl.pathname === "/login") {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/", nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.*\\.png|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest|sw\\.js).*)"],
};
