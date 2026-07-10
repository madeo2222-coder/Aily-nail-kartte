"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  activePrefixes: string[];
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "ホーム",
    icon: "🏠",
    activePrefixes: ["/dashboard"],
  },
  {
    href: "/reservations/calendar",
    label: "予約",
    icon: "📅",
    activePrefixes: ["/reservations"],
  },
  {
    href: "/customers",
    label: "顧客",
    icon: "👤",
    activePrefixes: ["/customers"],
  },
  {
    href: "/visits/new",
    label: "来店登録",
    icon: "✍️",
    activePrefixes: ["/visits"],
  },
  {
    href: "/intake-lookup",
    label: "初回確認",
    icon: "🔍",
    activePrefixes: ["/intake-lookup", "/customer-intake/list"],
  },
  {
    href: "/staff-tools",
    label: "ツール",
    icon: "🧰",
    activePrefixes: ["/staff-tools"],
  },
];

const hiddenPaths = [
  "/login",
  "/customer-intake",
  "/customer-app",
  "/owner-dashboard",
];

function isHiddenPath(pathname: string) {
  return hiddenPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export default function BottomNav() {
  const pathname = usePathname();

  if (isHiddenPath(pathname)) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 shadow-[0_-4px_18px_rgba(15,23,42,0.06)] backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-6">
        {navItems.map((item) => {
          const isActive = item.activePrefixes.some(
            (prefix) =>
              pathname === prefix || pathname.startsWith(`${prefix}/`)
          );

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[66px] min-w-0 flex-col items-center justify-center px-1 text-center text-[10px] font-bold transition ${
                isActive
                  ? "bg-orange-50 text-orange-500"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden="true">
                {item.icon}
              </span>

              <span className="mt-1 max-w-full truncate leading-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}