import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  STAFF_SESSION_COOKIE,
  verifyLegacyStaffSession,
} from "@/lib/auth/staffLegacySession";
import { authenticateStaff } from "@/lib/server/staffAuthentication";

type OwnerDashboardLayoutProps = {
  children: ReactNode;
};

export default async function OwnerDashboardLayout({
  children,
}: OwnerDashboardLayoutProps) {
  const cookieStore = await cookies();
  const legacyStaffSession = await verifyLegacyStaffSession(
    cookieStore.get(STAFF_SESSION_COOKIE)?.value
  );

  if (legacyStaffSession?.role === "owner") {
    return children;
  }

  const staffAuthentication = await authenticateStaff();

  if (!staffAuthentication.ok) {
    redirect(legacyStaffSession ? "/dashboard" : "/login");
  }

  if (staffAuthentication.staff.role !== "owner") {
    redirect("/dashboard");
  }

  return children;
}
