import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/customer-intake"];

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/customers",
  "/visits",
  "/sales-payments",
  "/reports",
  "/expenses",
  "/monthly-closing",
  "/reservations",
  "/designs",
  "/reviews",
  "/lost-customers",
];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

function hasSupabaseAuthCookie(req: NextRequest) {
  const cookies = req.cookies.getAll();

  return cookies.some((cookie) => {
    const name = cookie.name || "";
    return name.includes("sb-") && name.includes("auth-token");
  });
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const search = req.nextUrl.search;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const loggedIn = hasSupabaseAuthCookie(req);

  if (!loggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};