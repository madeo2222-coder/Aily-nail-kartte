import { NextResponse } from "next/server";
import { syncHpbMailText } from "@/lib/hpb-mail-sync";
import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

function getPublicSyncError(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";
  const hasJapaneseGuidance = /[ぁ-んァ-ヶ一-龠]/.test(message);
  const exposesInternalDetail =
    /supabase|postgres|sql|relation|column|constraint|duplicate key|jwt|service.role|環境変数/i.test(
      message
    );

  if (message && message.length <= 500 && hasJapaneseGuidance && !exposesInternalDetail) {
    return message;
  }

  return "予約メールを同期できませんでした。予約一覧を確認してから再試行してください。";
}

export async function POST(request: Request) {
  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });

  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, error: authentication.error },
      { status: authentication.status }
    );
  }

  try {
    const body = await request.json();
    const rawText = String(body.text || body.body || "").trim();
    const subject = String(body.subject || "").trim();

    if (!rawText) {
      return NextResponse.json(
        { ok: false, error: "メール本文が空です" },
        { status: 400 }
      );
    }

    const synced = await syncHpbMailText(rawText, subject);

    return NextResponse.json({
      ok: true,
      ...synced,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: getPublicSyncError(error),
      },
      { status: 500 }
    );
  }
}
