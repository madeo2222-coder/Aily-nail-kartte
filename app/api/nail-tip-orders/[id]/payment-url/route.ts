import { NextResponse } from "next/server";

const PAYMENT_UNAVAILABLE_MESSAGE =
  "カード決済は現在準備中です。Aily Nail Studioへお問い合わせください。";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: PAYMENT_UNAVAILABLE_MESSAGE },
    { status: 503 }
  );
}
