"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "ホーム" },
  { href: "/customers", label: "顧客" },
  { href: "/visits", label: "来店" },
  { href: "/receivables", label: "未収" },
  { href: "/customer-intake", label: "初回" },
];

export default function BottomNav() {
  const pathname = usePathname();

  // お客様が開く公開ページでは下部ナビを出さない
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
              className={`flex min-h-[64px] flex-col items-center justify-center text-sm font-medium transition ${
                isActive
                  ? "text-orange-500 bg-orange-50"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}