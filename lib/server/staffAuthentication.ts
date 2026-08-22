import "server-only";

import { isAuthSessionMissingError } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StaffRole = "owner" | "staff";

export type AuthenticatedStaff = {
  authUserId: string;
  staffId: string;
  salonId: string;
  role: StaffRole;
  isActive: true;
  authenticationMode: "supabase";
};

export type StaffAuthenticationFailureReason =
  | "auth_user_missing"
  | "staff_not_linked"
  | "staff_inactive"
  | "staff_role_invalid"
  | "staff_salon_missing"
  | "salon_not_found"
  | "lookup_failed";

export type StaffAuthenticationResult =
  | {
      ok: true;
      staff: AuthenticatedStaff;
    }
  | {
      ok: false;
      category: "unauthenticated" | "unauthorized" | "internal_error";
      reason: StaffAuthenticationFailureReason;
    };

type StaffLookupRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  is_active: boolean;
  salon_id: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isStaffRole(role: string | null): role is StaffRole {
  return role === "owner" || role === "staff";
}

function isUuid(value: string | null): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isUnauthenticatedStatus(status: number | undefined) {
  return status === 401 || status === 403;
}

export function isOwnerStaff(
  staff: AuthenticatedStaff
): staff is AuthenticatedStaff & { role: "owner" } {
  return staff.role === "owner";
}

export async function authenticateStaff(): Promise<StaffAuthenticationResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user) {
      if (
        authError &&
        !isAuthSessionMissingError(authError) &&
        !isUnauthenticatedStatus(authError.status)
      ) {
        return {
          ok: false,
          category: "internal_error",
          reason: "lookup_failed",
        };
      }

      return {
        ok: false,
        category: "unauthenticated",
        reason: "auth_user_missing",
      };
    }

    if (authError) {
      return {
        ok: false,
        category: "internal_error",
        reason: "lookup_failed",
      };
    }

    const { data: staffRows, error: staffError } = await supabase
      .from("staffs")
      .select("id, user_id, role, is_active, salon_id")
      .eq("user_id", user.id)
      .limit(2);

    if (staffError) {
      return {
        ok: false,
        category: "internal_error",
        reason: "lookup_failed",
      };
    }

    if (!staffRows || staffRows.length === 0) {
      return {
        ok: false,
        category: "unauthorized",
        reason: "staff_not_linked",
      };
    }

    if (staffRows.length !== 1) {
      return {
        ok: false,
        category: "internal_error",
        reason: "lookup_failed",
      };
    }

    const staff = staffRows[0] as StaffLookupRow;

    if (staff.user_id !== user.id) {
      return {
        ok: false,
        category: "internal_error",
        reason: "lookup_failed",
      };
    }

    if (staff.is_active !== true) {
      return {
        ok: false,
        category: "unauthorized",
        reason: "staff_inactive",
      };
    }

    if (!isStaffRole(staff.role)) {
      return {
        ok: false,
        category: "unauthorized",
        reason: "staff_role_invalid",
      };
    }

    if (!isUuid(staff.salon_id)) {
      return {
        ok: false,
        category: "unauthorized",
        reason: "staff_salon_missing",
      };
    }

    const { data: salonRows, error: salonError } = await supabase
      .from("salons")
      .select("id")
      .eq("id", staff.salon_id)
      .limit(2);

    if (salonError) {
      return {
        ok: false,
        category: "internal_error",
        reason: "lookup_failed",
      };
    }

    if (!salonRows || salonRows.length === 0) {
      return {
        ok: false,
        category: "unauthorized",
        reason: "salon_not_found",
      };
    }

    if (salonRows.length !== 1) {
      return {
        ok: false,
        category: "internal_error",
        reason: "lookup_failed",
      };
    }

    return {
      ok: true,
      staff: {
        authUserId: user.id,
        staffId: staff.id,
        salonId: staff.salon_id,
        role: staff.role,
        isActive: true,
        authenticationMode: "supabase",
      },
    };
  } catch {
    return {
      ok: false,
      category: "internal_error",
      reason: "lookup_failed",
    };
  }
}
