import { NextRequest, NextResponse } from "next/server";

const CUSTOMER_SESSION_COOKIE = "customer_line_session";
const STAFF_SESSION_COOKIE = "staff_session";
const STAFF_ROLE_COOKIE = "staff_role";

function hasCustomerSession(request: NextRequest) {
  return request.cookies.has(CUSTOMER_SESSION_COOKIE);
}

function hasStaffSession(request: NextRequest) {
  return request.cookies.has(STAFF_SESSION_COOKIE);
}

function getStaffRole(request: NextRequest) {
  const role = request.cookies.get(STAFF_ROLE_COOKIE)?.value;
  return role === "owner" ? "owner" : role === "staff" ? "staff" : null;
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

function isCustomerAllowedApiPath(pathname: string) {
  return (
    pathname.startsWith("/api/line-login/") ||
    pathname === "/api/reservations" ||
    pathname.startsWith("/api/reservations/") ||
    pathname === "/api/nail-tip-orders" ||
    pathname.startsWith("/api/nail-tip-orders/") ||
    pathname === "/api/sanmeigaku-diagnoses" ||
    pathname.startsWith("/api/sanmeigaku-diagnoses/")
  );
}

function isAllowedCustomerPath(pathname: string) {
  return (
    pathname === "/customer-app" ||
    pathname.startsWith("/customer-app/") ||
    pathname === "/customer-intake" ||
    pathname.startsWith("/customer-intake/") ||
    isCustomerAllowedApiPath(pathname)
  );
}

function isAllowedStaffPath(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/api/staff-login/");
}

function isBlockedApiPathForCustomer(pathname: string) {
  return pathname.startsWith("/api/") && !isCustomerAllowedApiPath(pathname);
}

function isStaffProtectedPath(pathname: string) {
  if (isStaticAsset(pathname)) return false;
  if (isAllowedCustomerPath(pathname)) return false;
  if (isAllowedStaffPath(pathname)) return false;

  return true;
}

function isOwnerOnlyPath(pathname: string) {
  return pathname === "/owner-dashboard" || pathname.startsWith("/owner-dashboard/");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const customerLoggedIn = hasCustomerSession(request);
  const staffLoggedIn = hasStaffSession(request);
  const staffRole = getStaffRole(request);

  if (customerLoggedIn) {
    if (isBlockedApiPathForCustomer(pathname)) {
      return NextResponse.json(
        { ok: false, error: "customer session cannot access staff api" },
        { status: 403 }
      );
    }

    if (!isAllowedCustomerPath(pathname)) {
      return NextResponse.redirect(new URL("/customer-app", request.url));
    }

    return NextResponse.next();
  }

  if (isStaffProtectedPath(pathname) && !staffLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && staffLoggedIn) {
    if (staffRole === "owner") {
      return NextResponse.redirect(new URL("/owner-dashboard", request.url));
    }

    return NextResponse.redirect(new URL("/", request.url));
  }

  if (staffLoggedIn && isOwnerOnlyPath(pathname) && staffRole !== "owner") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};