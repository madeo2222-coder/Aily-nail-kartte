import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log("LINE WEBHOOK");
    console.log(JSON.stringify(body, null, 2));

    const events = body.events || [];

    for (const event of events) {
      if (event.source?.userId) {
        console.log(
          "LINE USER ID:",
          event.source.userId
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("LINE WEBHOOK ERROR", error);

    return NextResponse.json(
      { ok: false },
      { status: 500 }
    );
  }
}