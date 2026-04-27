"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "ホーム", icon: "🏠" },
  { href: "/customers", label: "顧客", icon: "👤" },
  { href: "/visits", label: "来店", icon: "💅" },
  { href: "/expenses", label: "経費", icon: "🧾" },
  { href: "/finance", label: "収支", icon: "📊" },
  { href: "/receivables", label: "未収", icon: "💰" },
];

export default function BottomNav() {
  const pathname = usePathname();

  const hiddenPaths = [
    "/customer-intake",
    "/customer-app",
    "/owner-dashboard",
  ];

  const shouldHide = hiddenPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (shouldHide) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-6">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium transition ${
                isActive
                  ? "bg-orange-50 text-orange-500"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="mt-1 leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}