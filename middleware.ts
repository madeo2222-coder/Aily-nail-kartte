import { NextRequest, NextResponse } from "next/server";

const CUSTOMER_SESSION_COOKIE = "customer_line_session";
const STAFF_SESSION_COOKIE = "staff_session";
const STAFF_ROLE_COOKIE = "staff_role";

const OWNER_ONLY_PATHS = [
  "/owner-dashboard",
  "/tax",
  "/finance",
  "/expenses",
  "/sales-dashboard",
  "/sales-payments",
  "/monthly-closing",
  "/reminders",
  "/analytics",
  "/reports",
  "/settings/salon",
  "/staff/manage",
];

function hasCustomerSession(request: NextRequest) {
  return request.cookies.has(CUSTOMER_SESSION_COOKIE);
}

function hasStaffSession(request: NextRequest) {
  return request.cookies.has(STAFF_SESSION_COOKIE);
}

function getStaffRole(request: NextRequest) {
  const role = request.cookies.get(STAFF_ROLE_COOKIE)?.value;

  if (role === "owner") return "owner";
  if (role === "staff") return "staff";

  return null;
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
    /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml)$/i.test(
      pathname
    )
  );
}

function isCustomerAllowedApiPath(pathname: string) {
  return (
    pathname === "/api/hpb-gmail-sync" ||
    pathname.startsWith("/api/hpb-gmail-sync/") ||
    pathname === "/api/send-google-review-line" ||
    pathname.startsWith("/api/send-google-review-line/") ||
    pathname === "/api/inbound-nail-tip-requests" ||
    pathname.startsWith("/api/inbound-nail-tip-requests/") ||
    pathname.startsWith("/api/line-login/") ||
    pathname === "/api/line/webhook" ||
    pathname.startsWith("/api/line/webhook/") ||
    pathname === "/api/webhook" ||
    pathname.startsWith("/api/webhook/") ||
    pathname === "/api/reservations" ||
    pathname.startsWith("/api/reservations/") ||
    pathname === "/api/external-calendar-blocks" ||
    pathname.startsWith("/api/external-calendar-blocks/") ||
    pathname === "/api/send-reservation-confirmed-line" ||
    pathname.startsWith("/api/send-reservation-confirmed-line/") ||
    pathname === "/api/send-reservation-reminder-line" ||
    pathname.startsWith("/api/send-reservation-reminder-line/") ||
    pathname === "/api/send-review-request-line" ||
    pathname.startsWith("/api/send-review-request-line/") ||
    pathname === "/api/nail-tip-orders" ||
    pathname.startsWith("/api/nail-tip-orders/") ||
    pathname === "/api/customer-reservations/availability" ||
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
    pathname.startsWith("/nail-tip-order-pay/") ||
    pathname === "/external-calendar-blocks" ||
    pathname.startsWith("/external-calendar-blocks/") ||
    isCustomerAllowedApiPath(pathname)
  );
}

function isAllowedStaffPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/staff-login/")
  );
}

function isBlockedApiPathForCustomer(pathname: string) {
  return (
    pathname.startsWith("/api/") &&
    !isCustomerAllowedApiPath(pathname)
  );
}

function isStaffProtectedPath(pathname: string) {
  if (isStaticAsset(pathname)) return false;
  if (isAllowedCustomerPath(pathname)) return false;
  if (isAllowedStaffPath(pathname)) return false;

  return true;
}

function isOwnerOnlyPath(pathname: string) {
  return OWNER_ONLY_PATHS.some(
    (path) =>
      pathname === path || pathname.startsWith(`${path}/`)
  );
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
        {
          ok: false,
          error: "customer session cannot access staff api",
        },
        { status: 403 }
      );
    }

    if (!isAllowedCustomerPath(pathname)) {
      return NextResponse.redirect(
        new URL("/customer-app", request.url)
      );
    }

    return NextResponse.next();
  }

  if (isStaffProtectedPath(pathname) && !staffLoggedIn) {
    return NextResponse.redirect(
      new URL("/login", request.url)
    );
  }

  if (pathname === "/login" && staffLoggedIn) {
    if (staffRole === "owner") {
      return NextResponse.redirect(
        new URL("/owner-dashboard", request.url)
      );
    }

    return NextResponse.redirect(
      new URL("/dashboard", request.url)
    );
  }

  if (
    staffLoggedIn &&
    isOwnerOnlyPath(pathname) &&
    staffRole !== "owner"
  ) {
    return NextResponse.redirect(
      new URL("/dashboard", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
