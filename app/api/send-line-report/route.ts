import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/server/requireStaffSession";

export async function POST(req: NextRequest) {
  const authError = await requireStaffSession(req);
  if (authError) return authError;

  try {
    const userId = "ここに送信先ユーザーID"; // 後でDB化

    const now = new Date();
    const month = `${now.getFullYear()}/${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_BASE_URL が未設定です" },
        { status: 500 }
      );
    }

    const cookieHeader = req.headers.get("cookie") || "";

    const res = await fetch(`${baseUrl}/api/generate-report`, {
      method: "POST",
      body: JSON.stringify({ month }),
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: `レポート取得に失敗しました: ${errorText}` },
        { status: 500 }
      );
    }

    const data = await res.json();
    const s = data.data;

    if (!s) {
      return NextResponse.json(
        { error: "レポートデータが取得できませんでした" },
        { status: 500 }
      );
    }

    const lineAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!lineAccessToken) {
      return NextResponse.json(
        { error: "LINE_CHANNEL_ACCESS_TOKEN が未設定です" },
        { status: 500 }
      );
    }

    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lineAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: userId,
        messages: [
          {
            type: "text",
            text: `📊 月次レポート (${month})

売上：¥${s.totalSales.toLocaleString()}
経費：¥${s.totalExpenses.toLocaleString()}
粗利：¥${s.profit.toLocaleString()}

来店数：${s.visitCount}
客単価：¥${Math.round(s.avgUnitPrice).toLocaleString()}

👉 詳細はアプリで確認`,
          },
        ],
      }),
    });

    if (!lineRes.ok) {
      const lineError = await lineRes.text();
      return NextResponse.json(
        { error: `LINE送信に失敗しました: ${lineError}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("send-line-report error:", e);

    return NextResponse.json(
      { error: "line send error" },
      { status: 500 }
    );
  }
}
