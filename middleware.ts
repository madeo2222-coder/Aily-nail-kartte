import { NextRequest, NextResponse } from "next/server";

const CUSTOMER_SESSION_COOKIE = "customer_line_session";

function hasCustomerSession(request: NextRequest) {
  return request.cookies.has(CUSTOMER_SESSION_COOKIE);
}

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/public") ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml)$/i.test(pathname)
  );
}

function isAllowedCustomerPath(pathname: string) {
  return (
    pathname === "/customer-app" ||
    pathname.startsWith("/customer-app/") ||
    pathname === "/customer-intake" ||
    pathname.startsWith("/customer-intake/") ||
    pathname.startsWith("/api/line-login/")
  );
}

function isBlockedApiPath(pathname: string) {
  return pathname.startsWith("/api/") && !pathname.startsWith("/api/line-login/");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const isCustomerLoggedIn = hasCustomerSession(request);

  if (isCustomerLoggedIn) {
    if (isBlockedApiPath(pathname)) {
      return NextResponse.json(
        { ok: false, error: "customer session cannot access staff api" },
        { status: 403 }
      );
    }

    if (!isAllowedCustomerPath(pathname)) {
      return NextResponse.redirect(new URL("/customer-app", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};