import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_GMAIL_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "GOOGLE_GMAIL_CLIENT_ID / GOOGLE_GMAIL_CLIENT_SECRET / GOOGLE_GMAIL_REDIRECT_URI を確認してください",
        },
        { status: 500 }
      );
    }

    const code = request.nextUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { ok: false, error: "code がありません" },
        { status: 400 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    return NextResponse.json({
      ok: true,
      message:
        "GOOGLE_GMAIL_REFRESH_TOKEN を .env.local に保存してください。チャットには貼らないでください。",
      refreshToken: tokens.refresh_token || null,
      hasAccessToken: Boolean(tokens.access_token),
      expiryDate: tokens.expiry_date || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Gmail OAuth callback に失敗しました",
      },
      { status: 500 }
    );
  }
}