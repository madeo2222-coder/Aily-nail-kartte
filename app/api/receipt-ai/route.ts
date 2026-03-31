import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message: "AI receipt analysis is temporarily disabled.",
      reason: "stability_mode",
    },
    { status: 503 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      message: "AI receipt analysis is temporarily disabled.",
      reason: "stability_mode",
    },
    { status: 503 }
  );
}