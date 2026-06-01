import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const LINE_STATE_COOKIE = "line_login_state";
const LINE_PENDING_COOKIE = "customer_line_pending";
const LINE_SESSION_COOKIE = "customer_line_session";

type LineTokenResponse = {
  access_token: string;
  expires_in: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type LineVerifyResponse = {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  name?: string;
  picture?: string;
  email?: string;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin environment variables are missing.");
  }

  return createClient(url, key);
}

function getLineConfig() {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;

  if (!channelId || !channelSecret) {
    throw new Error("LINE Login environment variables are missing.");
  }

  return { channelId, channelSecret };
}

function buildRedirectUri(request: NextRequest) {
  const url = new URL(request.url);
  return `${url.origin}/api/line-login/session`;
}

function safeDecodeJson<T>(value: string | undefined): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function setCookie(
  response: NextResponse,
  name: string,
  value: string,
  maxAge: number
) {
  response.cookies.set(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

function clearCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function getSafeNextPath(value: string | null) {
  if (!value) return "/customer-app";
  if (!value.startsWith("/")) return "/customer-app";
  if (value.startsWith("//")) return "/customer-app";

  return value;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const nextPath = getSafeNextPath(url.searchParams.get("next"));

  if (mode === "start") {
    try {
      const { channelId } = getLineConfig();
      const redirectUri = buildRedirectUri(request);
      const stateValue = randomUUID();

      const authUrl = new URL("https://access.line.me/oauth2/v2.1/authorize");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", channelId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", stateValue);
      authUrl.searchParams.set("scope", "openid profile");
      authUrl.searchParams.set("prompt", "consent");

      const response = NextResponse.redirect(authUrl);

      setCookie(
        response,
        LINE_STATE_COOKIE,
        JSON.stringify({
          state: stateValue,
          next: nextPath,
        }),
        60 * 10
      );

      return response;
    } catch {
      const response = NextResponse.redirect(
        new URL("/customer-app/login?error=LINE設定が不足しています", request.url)
      );

      clearCookie(response, LINE_STATE_COOKIE);
      return response;
    }
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/customer-app/login?error=LINEログインの開始に失敗しました", request.url)
    );
  }

  try {
    const savedState = safeDecodeJson<{ state: string; next: string }>(
      request.cookies.get(LINE_STATE_COOKIE)?.value
    );

    if (!savedState || savedState.state !== state) {
      const response = NextResponse.redirect(
        new URL("/customer-app/login?error=LINEログイン状態の確認に失敗しました", request.url)
      );

      clearCookie(response, LINE_STATE_COOKIE);
      return response;
    }

    const { channelId, channelSecret } = getLineConfig();
    const redirectUri = buildRedirectUri(request);

    const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`LINE token exchange failed: ${text}`);
    }

    const tokenJson = (await tokenRes.json()) as LineTokenResponse;

    if (!tokenJson.id_token) {
      throw new Error("LINE id_token is missing.");
    }

    const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        id_token: tokenJson.id_token,
        client_id: channelId,
      }),
    });

    if (!verifyRes.ok) {
      const text = await verifyRes.text();
      throw new Error(`LINE token verify failed: ${text}`);
    }

    const verified = (await verifyRes.json()) as LineVerifyResponse;

    if (!verified.sub) {
      throw new Error("LINE user id is missing.");
    }

    const supabase = getSupabaseAdmin();

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, name, salon_id, line_user_id")
      .eq("line_user_id", verified.sub)
      .maybeSingle();

    if (customerError) {
      throw new Error(customerError.message);
    }

    if (customer) {
      const redirectTo = new URL(savedState.next || "/customer-app", request.url);
      const response = NextResponse.redirect(redirectTo);

      setCookie(
        response,
        LINE_SESSION_COOKIE,
        JSON.stringify({
          customer_id: customer.id,
          line_user_id: verified.sub,
        }),
        60 * 60 * 24 * 30
      );

      clearCookie(response, LINE_STATE_COOKIE);
      clearCookie(response, LINE_PENDING_COOKIE);
      return response;
    }

    const pendingNext = getSafeNextPath(savedState.next || "/customer-app");
    const pendingRedirectPath = pendingNext.startsWith("/customer-intake")
      ? pendingNext
      : "/customer-app/link";

    const response = NextResponse.redirect(
      new URL(pendingRedirectPath, request.url)
    );

    setCookie(
      response,
      LINE_PENDING_COOKIE,
      JSON.stringify({
        line_user_id: verified.sub,
        display_name: verified.name || "",
        picture_url: verified.picture || "",
        next: pendingNext,
      }),
      60 * 10
    );

    clearCookie(response, LINE_STATE_COOKIE);
    clearCookie(response, LINE_SESSION_COOKIE);

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "LINEログイン処理に失敗しました";

    const response = NextResponse.redirect(
      new URL(
        `/customer-app/login?error=${encodeURIComponent(message)}`,
        request.url
      )
    );

    clearCookie(response, LINE_STATE_COOKIE);
    clearCookie(response, LINE_PENDING_COOKIE);
    clearCookie(response, LINE_SESSION_COOKIE);

    return response;
  }
}