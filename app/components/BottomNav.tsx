"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "ホーム", icon: "🏠" },
  { href: "/customers", label: "顧客", icon: "👤" },
  { href: "/visits", label: "来店", icon: "💅" },
  { href: "/receivables", label: "未収", icon: "💰" },
  { href: "/customer-intake", label: "初回", icon: "📝" },
];

export default function BottomNav() {
  const pathname = usePathname();

  const hiddenPaths = ["/customer-intake"];

  const shouldHide = hiddenPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (shouldHide) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[64px] flex-col items-center justify-center text-xs font-medium transition ${
                isActive
                  ? "text-orange-500 bg-orange-50"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="mt-1">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}