import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { authenticateStaff } from "@/lib/server/staffAuthentication";

const STAFF_SESSION_COOKIE = "staff_session";
const STAFF_ROLE_COOKIE = "staff_role";

type OwnerDashboardLayoutProps = {
  children: ReactNode;
};

export default async function OwnerDashboardLayout({
  children,
}: OwnerDashboardLayoutProps) {
  const cookieStore = await cookies();
  const hasLegacyStaffSession = cookieStore.has(STAFF_SESSION_COOKIE);
  const legacyRole = cookieStore.get(STAFF_ROLE_COOKIE)?.value;

  if (hasLegacyStaffSession && legacyRole === "owner") {
    return children;
  }

  const staffAuthentication = await authenticateStaff();

  if (!staffAuthentication.ok) {
    redirect(hasLegacyStaffSession ? "/dashboard" : "/login");
  }

  if (staffAuthentication.staff.role !== "owner") {
    redirect("/dashboard");
  }

  return children;
}
