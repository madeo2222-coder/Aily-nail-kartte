import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type CustomerRow = {
  id: string;
  name: string | null;
  salon_id: string | null;
};

type StaffRow = {
  id: string;
  name: string | null;
  salon_id: string | null;
};

function isCancelledStatus(status: string | null) {
  return status === "キャンセル" || status === "cancelled";
}

function formatDateTimeForMail(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function sendReservationNoticeMail({
  customerName,
  menu,
  startIso,
  endIso,
  staffName,
  memo,
}: {
  customerName: string;
  menu: string;
  startIso: string;
  endIso: string;
  staffName: string;
  memo: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.RESERVATION_NOTIFY_EMAIL;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Aily Nail Studio <onboarding@resend.dev>";

  if (!resendApiKey || !notifyEmail) {
    console.log(
      "予約通知メールはスキップされました: RESEND_API_KEY または RESERVATION_NOTIFY_EMAIL が未設定です"
    );
    return;
  }

  const subject = "【Aily Nail Studio】新しい予約希望が入りました";

  const text = [
    "新しい予約希望が入りました。",
    "",
    `お客様名：${customerName}`,
    `メニュー：${menu}`,
    `予約開始：${formatDateTimeForMail(startIso)}`,
    `予約終了：${formatDateTimeForMail(endIso)}`,
    `担当者：${staffName}`,
    `ステータス：予約申請中`,
    "",
    "ご要望・備考：",
    memo || "-",
    "",
    "スタッフ予約ページで内容を確認してください。",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.8; color: #111827;">
      <h2>新しい予約希望が入りました</h2>
      <table style="border-collapse: collapse; width: 100%; max-width: 640px;">
        <tr>
          <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">お客様名</th>
          <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${customerName}</td>
        </tr>
        <tr>
          <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">メニュー</th>
          <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${menu}</td>
        </tr>
        <tr>
          <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">予約開始</th>
          <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${formatDateTimeForMail(
            startIso
          )}</td>
        </tr>
        <tr>
          <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">予約終了</th>
          <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${formatDateTimeForMail(
            endIso
          )}</td>
        </tr>
        <tr>
          <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">担当者</th>
          <td style="padding:8px; border-bottom:1px solid #e5e7eb;">${staffName}</td>
        </tr>
        <tr>
          <th style="text-align:left; padding:8px; border-bottom:1px solid #e5e7eb;">ステータス</th>
          <td style="padding:8px; border-bottom:1px solid #e5e7eb;">予約申請中</td>
        </tr>
      </table>

      <h3 style="margin-top:24px;">ご要望・備考</h3>
      <div style="white-space:pre-wrap; background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:12px;">
        ${memo || "-"}
      </div>

      <p style="margin-top:24px;">スタッフ予約ページで内容を確認してください。</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [notifyEmail],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("予約通知メール送信エラー:", errorText);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const menu = String(body.menu || "").trim();
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    const memo = String(body.memo || "").trim();
    const staffId = String(body.staffId || "").trim();
    const customerId = String(body.customerId || "").trim();
    let salonId = String(body.salonId || "").trim();

    if (!menu) {
      return NextResponse.json(
        { ok: false, error: "メニューが未入力です" },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { ok: false, error: "希望日が未入力です" },
        { status: 400 }
      );
    }

    if (!time) {
      return NextResponse.json(
        { ok: false, error: "希望時間が未入力です" },
        { status: 400 }
      );
    }

    let customerName = "お客様";
    let staffName = "指名なし";

    if (customerId) {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("id, name, salon_id")
        .eq("id", customerId)
        .maybeSingle();

      if (customerError) {
        return NextResponse.json(
          { ok: false, error: customerError.message },
          { status: 500 }
        );
      }

      const customer = customerData as CustomerRow | null;

      if (customer?.name) {
        customerName = customer.name;
      }

      if (!salonId && customer?.salon_id) {
        salonId = String(customer.salon_id);
      }
    }

    if (staffId) {
      const { data: staffData, error: staffError } = await supabase
        .from("staffs")
        .select("id, name, salon_id")
        .eq("id", staffId)
        .maybeSingle();

      if (staffError) {
        return NextResponse.json(
          { ok: false, error: staffError.message },
          { status: 500 }
        );
      }

      const staff = staffData as StaffRow | null;

      if (staff?.name) {
        staffName = staff.name;
      }

      if (!salonId && staff?.salon_id) {
        salonId = String(staff.salon_id);
      }
    }

    const startAt = new Date(`${date}T${time}:00+09:00`);

    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json(
        { ok: false, error: "予約日時が正しくありません" },
        { status: 400 }
      );
    }

    const endAt = new Date(startAt.getTime() + 90 * 60 * 1000);
    const startIso = startAt.toISOString();
    const endIso = endAt.toISOString();

    let overlapQuery = supabase
      .from("reservations")
      .select("id, status, staff_id, start_at, end_at, menu")
      .lt("start_at", endIso)
      .gt("end_at", startIso);

    if (salonId) {
      overlapQuery = overlapQuery.eq("salon_id", salonId);
    }

    if (staffId) {
      overlapQuery = overlapQuery.eq("staff_id", staffId);
    }

    const { data: overlapReservations, error: overlapError } =
      await overlapQuery;

    if (overlapError) {
      return NextResponse.json(
        { ok: false, error: overlapError.message },
        { status: 500 }
      );
    }

    const activeOverlaps = (overlapReservations || []).filter(
      (reservation) => !isCancelledStatus(reservation.status)
    );

    if (activeOverlaps.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: staffId
            ? "選択した担当者はその時間帯に既に予約があります"
            : "その時間帯は既に予約があります",
        },
        { status: 400 }
      );
    }

    const insertData: {
      menu: string;
      start_at: string;
      end_at: string;
      status: string;
      memo: string;
      staff_id?: string;
      customer_id?: string;
      salon_id?: string;
    } = {
      menu,
      start_at: startIso,
      end_at: endIso,
      status: "requested",
      memo,
    };

    if (staffId) {
      insertData.staff_id = staffId;
    }

    if (customerId) {
      insertData.customer_id = customerId;
    }

    if (salonId) {
      insertData.salon_id = salonId;
    }

    const { data, error } = await supabase
      .from("reservations")
      .insert(insertData)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    try {
      await sendReservationNoticeMail({
        customerName,
        menu,
        startIso,
        endIso,
        staffName,
        memo,
      });
    } catch (mailError) {
      console.error("予約通知メール処理エラー:", mailError);
    }

    return NextResponse.json({
      ok: true,
      reservationId: data.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "予約保存に失敗しました";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}