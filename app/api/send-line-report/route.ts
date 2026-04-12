import { NextResponse } from "next/server";

export async function POST() {
  try {
    const userId = "ここに送信先ユーザーID"; // 後でDB化

    const now = new Date();
    const month = `${now.getFullYear()}/${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;

    // レポート取得
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/generate-report`,
      {
        method: "POST",
        body: JSON.stringify({ month }),
        headers: { "Content-Type": "application/json" },
      }
    );

    const data = await res.json();
    const s = data.data;

    // LINE送信
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: userId,
        messages: [
          {
            type: "text",
            text: `
📊 月次レポート (${month})

売上：¥${s.totalSales.toLocaleString()}
経費：¥${s.totalExpenses.toLocaleString()}
粗利：¥${s.profit.toLocaleString()}

来店数：${s.visitCount}
客単価：¥${Math.round(s.avgUnitPrice).toLocaleString()}

👉 詳細はアプリで確認
            `,
          },
        ],
      }),
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "line send error" }, { status: 500 });
  }
}