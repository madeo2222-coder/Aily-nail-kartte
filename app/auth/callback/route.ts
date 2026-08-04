import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_NEXT_PATH = "/staff/setup-password";
const ALLOWED_NEXT_PATHS = new Set([DEFAULT_NEXT_PATH]);

function resolveNextPath(value: string | null) {
  if (!value) return DEFAULT_NEXT_PATH;

  let decodedValue = value;

  try {
    for (let index = 0; index < 3; index += 1) {
      const nextDecodedValue = decodeURIComponent(decodedValue);
      if (nextDecodedValue === decodedValue) break;
      decodedValue = nextDecodedValue;
    }
  } catch {
    return null;
  }

  if (
    decodedValue.includes("\\") ||
    decodedValue.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(decodedValue) ||
    !ALLOWED_NEXT_PATHS.has(decodedValue)
  ) {
    return null;
  }

  return decodedValue;
}

function createErrorRedirect(origin: string) {
  return NextResponse.redirect(
    new URL(
      "/staff/auth-error?reason=invalid_or_expired",
      origin
    )
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = resolveNextPath(
    requestUrl.searchParams.get("next")
  );

  if (!code || !nextPath) {
    return createErrorRedirect(requestUrl.origin);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return createErrorRedirect(requestUrl.origin);
    }

    return NextResponse.redirect(
      new URL(nextPath, requestUrl.origin)
    );
  } catch {
    return createErrorRedirect(requestUrl.origin);
  }
}
