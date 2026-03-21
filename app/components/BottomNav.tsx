"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/", label: "ホーム" },
  { href: "/customers", label: "顧客" },
  { href: "/visits", label: "来店" },
  { href: "/receivables", label: "未収" },
  { href: "/customer-intake", label: "初回" },
];

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/" || pathname === "/dashboard";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-gray-200 bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-2 px-2 py-2">
        {navItems.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex h-14 items-center justify-center rounded-xl text-xs font-semibold transition ${
                active
                  ? "bg-orange-100 text-orange-600"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}