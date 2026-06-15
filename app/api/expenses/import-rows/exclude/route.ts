import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      ok: true,
      message: "経費CSV取込行の除外APIは準備中です",
    },
    { status: 200 }
  );
}