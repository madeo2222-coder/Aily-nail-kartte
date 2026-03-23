"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";

export default function BottomNavVisibility() {
  const pathname = usePathname();

  const hiddenPaths = ["/customer-intake"];

  const shouldHide = hiddenPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (shouldHide) return null;

  return <BottomNav />;
}