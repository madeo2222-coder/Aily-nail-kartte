import { NextResponse } from "next/server";
import { syncHpbMailText } from "@/lib/hpb-mail-sync";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawText = String(body.text || body.body || "").trim();

    if (!rawText) {
      return NextResponse.json(
        { ok: false, error: "メール本文が空です" },
        { status: 400 }
      );
    }

    const synced = await syncHpbMailText(rawText);

    return NextResponse.json({
      ok: true,
      ...synced,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "HPBメール同期に失敗しました",
      },
      { status: 500 }
    );
  }
}