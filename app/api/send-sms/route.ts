import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, customerName, nextVisitDate, proposal } = body;

    if (!to) {
      return NextResponse.json(
        { error: "電話番号がありません" },
        { status: 400 }
      );
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromPhone) {
      return NextResponse.json(
        { error: "Twilio環境変数が未設定です" },
        { status: 500 }
      );
    }

    const client = twilio(accountSid, authToken);

    const message = `【Aily Nail Studio】
${customerName ?? "お客様"} 様

次回ご来店予定日が近づいています。
予定日：${nextVisitDate ?? "未設定"}

ご提案内容：
${proposal ?? "なし"}

ご来店をお待ちしております。`;

    const result = await client.messages.create({
      body: message,
      from: fromPhone,
      to,
    });

    return NextResponse.json({
      success: true,
      sid: result.sid,
    });
  } catch (error: any) {
    console.error("SMS送信APIエラー:", error);

    return NextResponse.json(
      {
        error: error?.message || "SMS送信に失敗しました",
      },
      { status: 500 }
    );
  }
}