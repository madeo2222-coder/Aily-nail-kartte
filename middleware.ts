import { NextRequest, NextResponse } from "next/server";

import {
  STAFF_SESSION_COOKIE,
  verifyLegacyStaffSession,
} from "@/lib/auth/staffLegacySession";

const CUSTOMER_SESSION_COOKIE = "customer_line_session";

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
    pathname === "/auth/callback" ||
    pathname === "/auth/confirm" ||
    pathname === "/staff/setup-password" ||
    pathname === "/staff/auth-error" ||
    pathname === "/api/staff-auth/login" ||
    pathname === "/api/staff-auth/logout" ||
    pathname.startsWith("/api/staff-login/")
  );
}

function isServerAuthenticatedStaffPath(pathname: string) {
  return pathname === "/dashboard" || pathname === "/owner-dashboard";
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
  if (isServerAuthenticatedStaffPath(pathname)) return false;

  return true;
}

function isOwnerOnlyPath(pathname: string) {
  return OWNER_ONLY_PATHS.some(
    (path) =>
      pathname === path || pathname.startsWith(`${path}/`)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const customerLoggedIn = hasCustomerSession(request);
  const legacyStaffSession = await verifyLegacyStaffSession(
    request.cookies.get(STAFF_SESSION_COOKIE)?.value
  );
  const staffLoggedIn = Boolean(legacyStaffSession);
  const staffRole = legacyStaffSession?.role ?? null;

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
    !isServerAuthenticatedStaffPath(pathname) &&
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
