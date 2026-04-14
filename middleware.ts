import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const isDemo = request.cookies.get("springa-demo")?.value === "1";
  if (!isDemo) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Don't rewrite auth routes — demo users don't need them but they shouldn't break
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  // Rewrite all API routes to the demo catch-all
  if (pathname.startsWith("/api/")) {
    const demoPath = pathname.replace(/^\/api\//, "/api/demo/");
    const url = request.nextUrl.clone();
    url.pathname = demoPath;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
