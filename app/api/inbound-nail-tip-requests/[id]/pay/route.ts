import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "カード決済は現在準備中です。Aily Nail Studioへお問い合わせください。",
    },
    { status: 503 }
  );
}
