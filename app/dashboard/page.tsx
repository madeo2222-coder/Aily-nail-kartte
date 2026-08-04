import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { authenticateStaff } from "@/lib/server/staffAuthentication";
import DashboardPageClient from "./DashboardPageClient";

export const dynamic = "force-dynamic";

const STAFF_SESSION_COOKIE = "staff_session";

function DashboardPageFallback() {
  return <div className="p-4 pb-24">読み込み中...</div>;
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const hasLegacyStaffSession = cookieStore.has(STAFF_SESSION_COOKIE);

  if (!hasLegacyStaffSession) {
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
