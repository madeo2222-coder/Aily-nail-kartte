import "server-only";

import { cookies } from "next/headers";

import {
  authenticateStaff,
  type StaffRole,
} from "@/lib/server/staffAuthentication";

const STAFF_SESSION_COOKIE = "staff_session";
const STAFF_ROLE_COOKIE = "staff_role";

type SupabaseStaffApiPrincipal = {
  authenticationMode: "supabase";
  staffId: string;
  salonId: string;
  role: StaffRole;
  isActive: true;
};

type LegacyStaffApiPrincipal = {
  authenticationMode: "legacy";
  staffId: null;
  salonId: null;
  role: StaffRole | null;
  isActive: null;
};

export type StaffApiPrincipal =
  | SupabaseStaffApiPrincipal
  | LegacyStaffApiPrincipal;

export type StaffApiAuthenticationOptions = {
  allowedRoles?: readonly StaffRole[];
  legacyAllowed?: boolean;
  salonContextRequired?: boolean;
};

export type StaffApiAuthenticationResult =
  | { ok: true; principal: StaffApiPrincipal }
  | { ok: false; status: 401 | 403 | 500; error: string };

function isStaffRole(value: string | undefined): value is StaffRole {
  return value === "owner" || value === "staff";
}

export async function authenticateStaffApi(
  options: StaffApiAuthenticationOptions = {}
): Promise<StaffApiAuthenticationResult> {
  const allowedRoles = options.allowedRoles;
  const legacyAllowed = options.legacyAllowed ?? false;
  const salonContextRequired = options.salonContextRequired ?? true;
  const authentication = await authenticateStaff();

  if (authentication.ok) {
    if (allowedRoles && !allowedRoles.includes(authentication.staff.role)) {
      return {
        ok: false,
        status: 403,
        error: "この操作を行う権限がありません。",
      };
    }

    return {
      ok: true,
      principal: {
        authenticationMode: "supabase",
        staffId: authentication.staff.staffId,
        salonId: authentication.staff.salonId,
        role: authentication.staff.role,
        isActive: true,
      },
    };
  }

  if (authentication.category === "internal_error") {
    return {
      ok: false,
      status: 500,
      error: "スタッフ認証を確認できませんでした。",
    };
  }

  if (authentication.category === "unauthorized") {
    return {
      ok: false,
      status: 403,
      error: "この操作を行う権限がありません。",
    };
  }

  if (!legacyAllowed) {
    return {
      ok: false,
      status: 401,
      error: "スタッフ認証が必要です。",
    };
  }

  const cookieStore = await cookies();
  const staffSession = cookieStore.get(STAFF_SESSION_COOKIE)?.value;

  if (staffSession !== "active") {
    return {
      ok: false,
      status: 401,
      error: "スタッフ認証が必要です。",
    };
  }

  if (salonContextRequired) {
    return {
      ok: false,
      status: 403,
      error: "この操作を行う権限がありません。",
    };
  }

  const storedRole = cookieStore.get(STAFF_ROLE_COOKIE)?.value;
  if (!isStaffRole(storedRole)) {
    return {
      ok: false,
      status: 403,
      error: "この操作を行う権限がありません。",
    };
  }

  const legacyRole = storedRole;

  if (allowedRoles && !allowedRoles.includes(legacyRole)) {
    return {
      ok: false,
      status: 403,
      error: "この操作を行う権限がありません。",
    };
  }

  return {
    ok: true,
    principal: {
      authenticationMode: "legacy",
      staffId: null,
      salonId: null,
      role: legacyRole,
      isActive: null,
    },
  };
}
