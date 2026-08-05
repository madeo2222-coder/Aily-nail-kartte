import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  STAFF_SESSION_COOKIE,
  verifyLegacyStaffSession,
} from "@/lib/auth/staffLegacySession";
import { authenticateStaff } from "@/lib/server/staffAuthentication";
import DashboardPageClient from "./DashboardPageClient";

export const dynamic = "force-dynamic";

function DashboardPageFallback() {
  return <div className="p-4 pb-24">読み込み中...</div>;
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const legacyStaffSession = await verifyLegacyStaffSession(
    cookieStore.get(STAFF_SESSION_COOKIE)?.value
  );

  if (!legacyStaffSession) {
    const staffAuthentication = await authenticateStaff();

    if (!staffAuthentication.ok) {
      redirect("/login");
    }
  }

  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <DashboardPageClient />
    </Suspense>
  );
}
