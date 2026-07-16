import { NextResponse } from "next/server";
import { getVeriTransTokenApiKey } from "@/lib/veritrans/config";

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      tokenApiKey: getVeriTransTokenApiKey(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Token API Key取得失敗",
      },
      {
        status: 500,
      }
    );
  }
}