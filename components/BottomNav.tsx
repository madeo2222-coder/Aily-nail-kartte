"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  activePrefixes: string[];
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "ホーム", icon: "🏠", activePrefixes: ["/dashboard"] },
  { href: "/customers", label: "顧客", icon: "👤", activePrefixes: ["/customers"] },
  { href: "/reservations/calendar", label: "予約", icon: "📅", activePrefixes: ["/reservations"] },
  { href: "/visits/new", label: "来店", icon: "💅", activePrefixes: ["/visits"] },
  { href: "/nail-tip-orders", label: "チップ", icon: "🛍️", activePrefixes: ["/nail-tip-orders"] },
  { href: "/inbound-nail-tip-requests", label: "海外", icon: "🌏", activePrefixes: ["/inbound-nail-tip-requests"] },
  { href: "/staff-tools", label: "ツール", icon: "🧰", activePrefixes: ["/staff-tools"] },
];

const hiddenPaths = [
  "/login", "/customer-intake", "/customer-app", "/owner-dashboard",
  "/invite", "/repair-status", "/repair-request-form", "/support-chat",
];

function isHiddenPath(pathname: string) {
  return hiddenPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const [pendingReservationCount, setPendingReservationCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchPendingReservationCount() {
      const { count, error } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .in("status", ["requested", "予約申請中", "予約受付", "予約"]);

      if (!active) return;

      if (error) {
        console.error("pending reservation count fetch error:", error.message);
        setPendingReservationCount(0);
        return;
      }

      setPendingReservationCount(count || 0);
    }

    void fetchPendingReservationCount();

    function handleFocus() {
      void fetchPendingReservationCount();
    }

    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
    };
  }, [pathname]);

  if (isHiddenPath(pathname)) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 shadow-[0_-4px_18px_rgba(15,23,42,0.06)] backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid w-full max-w-lg grid-cols-7">
        {navItems.map((item) => {
          const isActive = item.activePrefixes.some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
          );
          const showReservationBadge =
            item.activePrefixes.includes("/reservations") && pendingReservationCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[66px] min-w-0 flex-col items-center justify-center px-0.5 text-center text-[9px] font-bold transition ${
                isActive
                  ? "bg-orange-50 text-orange-500"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <span className="relative inline-flex" aria-hidden="true">
                <span className="text-lg leading-none">{item.icon}</span>
                {showReservationBadge ? (
                  <span className="absolute -right-3 -top-3 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-1 text-[10px] font-black leading-none text-white shadow-sm">
                    {pendingReservationCount > 9 ? "9+" : pendingReservationCount}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 w-full truncate leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}