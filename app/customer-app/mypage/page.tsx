"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRow = {
  id: string;
  name: string | null;
  salon_id: string | null;
  phone?: string | null;
  line_name?: string | null;
  coupon_500_count?: number | null;
  coupon_1000_count?: number | null;
};

type SalonRow = {
  id: string;
  name: string | null;
};

type VisitRow = {
  id: string;
  visit_date: string | null;
  menu: string | null;
  menu_name: string | null;
  created_at: string | null;
};

type ReservationRow = {
  id: string;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  memo: string | null;
  created_at: string | null;
};

type StaffRow = {
  id: string;
  name: string | null;
};

type DiagnosisRow = {
  id: string;
  customer_id: string | null;
  name: string | null;
  birthday: string | null;
  fortune: string | null;
  mood: string | null;
  lucky_color: string | null;
  lucky_stone: string | null;
  nail_theme: string | null;
  diagnosis_message: string | null;
  diagnosis_type: string | null;
  created_at: string | null;
};

type MeResponse = {
  authenticated: boolean;
  customer?: CustomerRow | null;
};

const signedInNavItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  { key: "gallery", label: "ギャラリー", icon: "💅", href: "/customer-app/gallery" },
  { key: "diagnosis", label: "診断", icon: "✨", href: "/customer-app/sanmeigaku" },
  { key: "mypage", label: "マイ", icon: "👤", href: "/customer-app/mypage" },
];

function normalizeSupabaseDateTime(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const isoLike = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  return `${isoLike}Z`;
}

function getJstParts(value: string | null) {
  const normalizedValue = normalizeSupabaseDateTime(value);
  if (!normalizedValue) return null;

  const target = new Date(normalizedValue);
  if (Number.isNaN(target.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(target);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: map.get("year") || "",
    month: map.get("month") || "",
    day: map.get("day") || "",
    hour: map.get("hour") || "",
    minute: map.get("minute") || "",
  };
}

function formatDate(value: string | null) {
  const parts = getJstParts(value);
  if (!parts) return "未登録";

  return `${Number(parts.year)}/${Number(parts.month)}/${Number(parts.day)}`;
}

function formatDateTime(value: string | null) {
  const parts = getJstParts(value);
  if (!parts) return "未登録";

  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatTime(value: string | null) {
  const parts = getJstParts(value);
  if (!parts) return "";

  return `${parts.hour}:${parts.minute}`;
}

function formatEndTime(startAt: string | null, endAt: string | null) {
  const startParts = getJstParts(startAt);
  const endParts = getJstParts(endAt);

  if (!startParts || !endParts) return "";

  const startTotal = Number(startParts.hour) * 60 + Number(startParts.minute);
  const endTotal = Number(endParts.hour) * 60 + Number(endParts.minute);

  if (!Number.isFinite(startTotal) || !Number.isFinite(endTotal)) return "";
  if (endTotal <= startTotal) return "";

  return `${endParts.hour}:${endParts.minute}`;
}

function getDisplayMenu(visit: VisitRow | null) {
  if (!visit) return "未登録";
  if (visit.menu_name?.trim()) return visit.menu_name;
  if (visit.menu?.trim()) return visit.menu;
  return "メニュー未登録";
}

function isCancelled(status: string | null) {
  return status === "キャンセル" || status === "cancelled";
}

function getReservationStatusLabel(status: string | null) {
  switch (status) {
    case "requested":
      return "予約申請中";
    case "confirmed":
      return "予約確定";
    case "completed":
      return "来店完了";
    case "cancelled":
    case "キャンセル":
      return "キャンセル";
    case "予約":
      return "予約受付";
    case "来店":
      return "来店予定";
    case "完了":
      return "来店完了";
    default:
      return status || "未設定";
  }
}

function getReservationStatusClass(status: string | null) {
  const label = getReservationStatusLabel(status);

  if (label === "予約申請中" || label === "予約受付") {
    return "bg-amber-100 text-amber-700";
  }

  if (label === "予約確定") {
    return "bg-blue-100 text-blue-700";
  }

  if (label === "来店予定") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (label === "来店完了") {
    return "bg-slate-100 text-slate-700";
  }

  if (label === "キャンセル") {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-slate-100 text-slate-700";
}

function hasGalleryReference(memo: string | null) {
  return String(memo || "").includes("Aily Gallery参考デザインあり");
}

function extractCustomerMemo(memo: string | null) {
  if (!memo) return "";

  return memo
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();

      if (trimmed === "Aily Gallery参考デザインあり") return false;
      if (trimmed.startsWith("参考デザインID：")) return false;
      if (trimmed.startsWith("参考写真URL：")) return false;
      if (trimmed.startsWith("参考メニュー：")) return false;
      if (trimmed.startsWith("参考カラー：")) return false;
      if (trimmed.startsWith("合計金額目安：")) return false;
      if (trimmed.startsWith("所要時間目安：")) return false;
      if (trimmed === "時間内訳") return false;
      if (trimmed === "金額内訳") return false;
      if (trimmed.startsWith("・")) return false;

      return true;
    })
    .join("\n")
    .replace(/^備考：/, "")
    .trim();
}

function getCouponProgressText(visitCount: number, target: number) {
  const remainder = visitCount % target;
  if (remainder === 0 && visitCount > 0) return "達成済み";
  return `あと${target - remainder}回`;
}

export default function CustomerAppMyPage() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [salonName, setSalonName] = useState("Aily Nail Studio");
  const [latestVisit, setLatestVisit] = useState<VisitRow | null>(null);
  const [latestDiagnosis, setLatestDiagnosis] = useState<DiagnosisRow | null>(null);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [message, setMessage] = useState("");
  const [visitCount, setVisitCount] = useState(0);

type NailTipOrderRow = {
  id: string;
  design_request: string | null;
  payment_due_at: string | null;
  status: string | null;
  created_at: string | null;
  shipping_company: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
};

const [nailTipOrders, setNailTipOrders] = useState<NailTipOrderRow[]>([]);
  useEffect(() => {
    async function fetchMyPage() {
      setLoading(true);
      setMessage("");

      try {
        const meRes = await fetch("/api/line-login/me", {
          cache: "no-store",
        });

        const meJson = (await meRes.json()) as MeResponse;

        if (!meJson.authenticated || !meJson.customer) {
          setIsLoggedIn(false);
          setLoading(false);
          return;
        }

        const currentCustomer = meJson.customer;

        setIsLoggedIn(true);
        setCustomer(currentCustomer);

        if (currentCustomer.salon_id) {
          const { data: salonData } = await supabase
            .from("salons")
            .select("id, name")
            .eq("id", currentCustomer.salon_id)
            .single();

          if (salonData) {
            const salon = salonData as SalonRow;
            setSalonName(salon.name || "Aily Nail Studio");
          }
        }

        const { data: visitData } = await supabase
          .from("visits")
          .select("id, visit_date, menu, menu_name, created_at")
          .eq("customer_id", currentCustomer.id)
          .order("visit_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        setLatestVisit(((visitData || [])[0] as VisitRow | undefined) || null);

        const { count } = await supabase
          .from("visits")
          .select("*", { count: "exact", head: true })
          .eq("customer_id", currentCustomer.id);

        setVisitCount(count || 0);

        const { data: diagnosisData, error: diagnosisError } = await supabase
          .from("sanmeigaku_diagnoses")
          .select("id, customer_id, created_at")
          .eq("customer_id", currentCustomer.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (diagnosisError) {
          console.error("sanmeigaku_diagnoses取得エラー:", diagnosisError);
          setLatestDiagnosis(null);
        } else {
          setLatestDiagnosis(
            ((diagnosisData || [])[0] as DiagnosisRow | undefined) || null
          );
        }

        const { data: reservationData, error: reservationError } = await supabase
          .from("reservations")
          .select(
            "id, customer_id, staff_id, menu, start_at, end_at, status, memo, created_at"
          )
          .eq("customer_id", currentCustomer.id)
          .order("start_at", { ascending: true })
          .limit(50);

        if (reservationError) {
          console.error("reservations取得エラー:", reservationError);
          setReservations([]);
        } else {
          setReservations((reservationData || []) as ReservationRow[]);
        }

        const { data: staffData, error: staffError } = await supabase
          .from("staffs")
          .select("id, name")
          .order("name", { ascending: true });

if (staffError) {
  console.error("staffs取得エラー:", staffError);
  setStaffs([]);
} else {
  setStaffs((staffData || []) as StaffRow[]);
}
const { data: nailTipOrderData, error: nailTipOrderError } = await supabase
  .from("nail_tip_orders")
  .select(`
    id,
    customer_id,
    design_request,
    payment_due_at,
    status,
    created_at,
    shipping_company,
    tracking_number,
    shipped_at
  `)
  .eq("customer_id", currentCustomer.id)
  .order("created_at", { ascending: false });

if (nailTipOrderError) {
  console.error("ネイルチップ注文取得エラー:", nailTipOrderError);
  setNailTipOrders([]);
} else {
  setNailTipOrders((nailTipOrderData || []) as NailTipOrderRow[]);
}
        
      } catch (error) {
        console.error("mypage取得エラー:", error);
        setMessage("マイページ情報の取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    }

    fetchMyPage();
  }, []);

  const customerName = useMemo(() => {
    return customer?.name || "お客様";
  }, [customer]);

  const staffMap = useMemo(() => {
    const map = new Map<string, string>();

    staffs.forEach((staff) => {
      if (staff.id) {
        map.set(staff.id, staff.name || "未設定");
      }
    });

    return map;
  }, [staffs]);

  const nowTime = useMemo(() => Date.now(), []);

  const activeReservations = useMemo(() => {
    return reservations.filter((item) => !isCancelled(item.status));
  }, [reservations]);

  const upcomingReservations = useMemo(() => {
    return activeReservations
      .filter((item) => {
        const normalizedValue = normalizeSupabaseDateTime(item.start_at);
        if (!normalizedValue) return false;

        const target = new Date(normalizedValue).getTime();

        return Number.isFinite(target) && target >= nowTime;
      })
      .sort((a, b) => {
        const aTime = new Date(
          normalizeSupabaseDateTime(a.start_at) || ""
        ).getTime();
        const bTime = new Date(
          normalizeSupabaseDateTime(b.start_at) || ""
        ).getTime();

        return aTime - bTime;
      });
  }, [activeReservations, nowTime]);

  const latestReservation = useMemo(() => {
    return (
      [...activeReservations].sort((a, b) => {
        const aTime = new Date(
          normalizeSupabaseDateTime(a.start_at) || ""
        ).getTime();
        const bTime = new Date(
          normalizeSupabaseDateTime(b.start_at) || ""
        ).getTime();

        return bTime - aTime;
      })[0] || null
    );
  }, [activeReservations]);

  async function handleLogout() {
    await fetch("/api/line-login/logout", {
      method: "POST",
    });

    window.location.href = "/customer-app";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 pb-6 pt-4">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">マイページ</div>
            <div className="mt-3 text-sm text-slate-600">読み込み中...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
          <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow">
            <div className="text-xs font-bold tracking-wide opacity-90">
              AILY MY PAGE
            </div>

            <h1 className="mt-2 text-2xl font-bold leading-tight">
              マイページ
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/90">
              マイページはLINEログイン後に確認できます。
            </p>

            <Link
              href="/customer-app/login"
              className="mt-4 block rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-900"
            >
              LINEでログイン
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>

          <div className="mt-2 text-sm opacity-90">{salonName}</div>

          <h1 className="mt-2 text-2xl font-bold leading-tight">
            {customerName}様のマイページ
          </h1>

          <p className="mt-3 text-sm leading-6 text-white/90">
            登録情報、診断結果、来店ポイント、予約状況を確認できます。
          </p>
        </section>

        {message ? (
          <section className="rounded-3xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
            {message}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 p-5 text-white shadow">
          <div className="text-xs font-black tracking-[0.25em] text-white/80">
            AI BEAUTY ORACLE
          </div>

          <h2 className="mt-2 text-2xl font-black leading-tight">
            最新の算命学ネイル診断
          </h2>

          {latestDiagnosis ? (
            <>
              <div className="mt-4 rounded-3xl bg-white/15 p-4 backdrop-blur">
                <div className="text-xs font-bold text-white/70">
                  診断日
                </div>
                <div className="mt-1 text-sm font-bold">
                  {formatDate(latestDiagnosis.created_at)}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <div className="rounded-2xl bg-white/15 p-3">
                    <div className="text-xs text-white/70">
                      ラッキーカラー
                    </div>
                    <div className="mt-1 text-lg font-black">
                      {latestDiagnosis.lucky_color || "未登録"}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/15 p-3">
                    <div className="text-xs text-white/70">
                      ラッキーストーン
                    </div>
                    <div className="mt-1 text-lg font-black">
                      {latestDiagnosis.lucky_stone || "未登録"}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/15 p-3">
                    <div className="text-xs text-white/70">
                      開運テーマ
                    </div>
                    <div className="mt-1 text-sm font-bold leading-6">
                      {latestDiagnosis.nail_theme || "未登録"}
                    </div>
                  </div>
                </div>

                {latestDiagnosis.diagnosis_message ? (
                  <div className="mt-4 rounded-2xl bg-white/15 p-3 text-sm leading-6 text-white/90">
                    {latestDiagnosis.diagnosis_message}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2">
                <Link
                  href="/customer-app/reserve?menu=開運ネイル相談"
                  className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-fuchsia-600"
                >
                  この診断で施術予約する
                </Link>

                <Link
                  href={`/customer-app/nail-tip-order?color=${encodeURIComponent(
                    latestDiagnosis.lucky_color || ""
                  )}&stone=${encodeURIComponent(
                    latestDiagnosis.lucky_stone || ""
                  )}&theme=${encodeURIComponent(
                    latestDiagnosis.nail_theme || ""
                  )}`}
                  className="rounded-2xl border border-white/30 px-4 py-3 text-center text-sm font-black text-white"
                >
                  この診断でチップ注文する
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm leading-6 text-white/90">
                まだ診断結果がありません。今のあなたに合うカラー、天然石、開運ネイルを無料で診断できます。
              </p>

              <Link
                href="/customer-app/sanmeigaku"
                className="mt-4 block rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-fuchsia-600"
              >
                無料で算命学ネイル診断をする
              </Link>
            </>
          )}
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">お客様情報</div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">お名前</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {customer?.name || "未登録"}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">サロン</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {salonName}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">来店ポイント</div>
          <div className="mt-1 text-xs text-slate-500">
            公式LINEポイントカードと同じ特典内容です。
          </div>

          <div className="mt-4 rounded-3xl bg-gradient-to-br from-pink-50 to-orange-50 p-4">
            <div className="text-xs font-bold text-slate-500">
              現在の来店回数
            </div>

            <div className="mt-1 text-3xl font-black text-slate-900">
              {visitCount}回
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-3">
                <div className="text-xs font-bold text-slate-500">
                  6回特典まで
                </div>
                <div className="mt-1 text-lg font-black text-pink-600">
                  {getCouponProgressText(visitCount, 6)}
                </div>
                <div className="mt-1 text-xs text-slate-500">500円OFF</div>
              </div>

              <div className="rounded-2xl bg-white p-3">
                <div className="text-xs font-bold text-slate-500">
                  12回特典まで
                </div>
                <div className="mt-1 text-lg font-black text-orange-600">
                  {getCouponProgressText(visitCount, 12)}
                </div>
                <div className="mt-1 text-xs text-slate-500">1,000円OFF</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-bold text-slate-900">
                利用可能クーポン
              </div>
              <div className="mt-1 text-xs text-slate-500">
                来店ポイント達成で付与されます。
              </div>
            </div>

            <div className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
              {(customer?.coupon_500_count || 0) +
                (customer?.coupon_1000_count || 0)}
              枚
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between rounded-2xl bg-pink-50 px-4 py-4">
              <div>
                <div className="text-sm font-bold text-slate-900">
                  500円OFFクーポン
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  6回来店ごとに付与
                </div>
              </div>

              <div className="text-2xl font-black text-pink-600">
                ×{customer?.coupon_500_count || 0}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-orange-50 px-4 py-4">
              <div>
                <div className="text-sm font-bold text-slate-900">
                  1,000円OFFクーポン
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  12回来店ごとに付与
                </div>
              </div>

              <div className="text-2xl font-black text-orange-600">
                ×{customer?.coupon_1000_count || 0}
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs leading-5 text-slate-500">
            クーポン利用時はスタッフが会計時に適用します。
          </div>
        </section>
<section className="rounded-3xl border bg-white p-4 shadow-sm">
  <div className="flex items-center justify-between">
    <div className="text-base font-bold text-slate-900">
      ネイルチップ注文
    </div>

    <div className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
      {nailTipOrders.length}件
    </div>
  </div>

  {nailTipOrders.length === 0 ? (
    <div className="mt-4 text-sm text-slate-500">
      注文履歴はありません。
    </div>
  ) : (
    <div className="mt-4 space-y-3">
      {nailTipOrders.slice(0, 3).map((order) => (
        <div
          key={order.id}
          className="rounded-2xl bg-violet-50 p-4"
        >
          <div className="text-xs text-violet-500">
            注文日
          </div>

          <div className="font-bold">
            {formatDateTime(order.created_at)}
          </div>

          <div className="mt-3 text-xs text-slate-500">
            状態
          </div>

          <div className="font-bold text-violet-700">
            {order.status || "未設定"}
          </div>
{order.status === "shipped" ? (
  <div className="mt-3 rounded-xl bg-white p-3">
    <div className="text-xs text-slate-500">
      配送会社
    </div>
    <div className="font-bold text-slate-900">
      {order.shipping_company || "未登録"}
    </div>

    <div className="mt-2 text-xs text-slate-500">
      追跡番号
    </div>
    <div className="font-bold text-slate-900">
      {order.tracking_number || "未登録"}
    </div>

    <div className="mt-2 text-xs text-slate-500">
      発送日時
    </div>
    <div className="font-bold text-slate-900">
      {formatDateTime(order.shipped_at)}
    </div>
  </div>
) : null}
        </div>
      ))}
    </div>
  )}
</section>
        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">前回来店</div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">前回来店日</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {formatDate(latestVisit?.visit_date || null)}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">前回メニュー</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {getDisplayMenu(latestVisit)}
              </div>
            </div>
          </div>

          <Link
            href="/customer-app/history"
            className="mt-4 block w-full rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
          >
            来店履歴を見る
          </Link>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-bold text-slate-900">
                予約状況
              </div>
              <div className="mt-1 text-xs text-slate-500">
                予約申請中・予約確定の内容を確認できます。
              </div>
            </div>

            <div className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
              {upcomingReservations.length}件
            </div>
          </div>

          {upcomingReservations.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-700">
                現在、未来の予約はありません。
              </div>

              {latestReservation ? (
                <div className="mt-3 rounded-2xl bg-white p-3">
                  <div className="text-xs text-slate-500">直近の予約履歴</div>
                  <div className="mt-1 text-sm font-bold leading-6 text-slate-900">
                    {formatDateTime(latestReservation.start_at)}
                    <br />
                    {latestReservation.menu || "メニュー未登録"}
                  </div>
                </div>
              ) : null}

              <Link
                href="/customer-app/reserve"
                className="mt-4 block w-full rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
              >
                予約する
              </Link>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {upcomingReservations.slice(0, 3).map((reservation) => {
                const staffName = reservation.staff_id
                  ? staffMap.get(reservation.staff_id) || "未設定"
                  : "指名なし";

                const customerMemo = extractCustomerMemo(reservation.memo);
                const endTimeText = formatEndTime(
                  reservation.start_at,
                  reservation.end_at
                );

                return (
                  <article
                    key={reservation.id}
                    className="rounded-3xl border border-rose-100 bg-rose-50/40 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-rose-500">
                          次回予約
                        </div>
                        <div className="mt-1 text-lg font-black text-slate-900">
                          {formatDateTime(reservation.start_at)}
                        </div>
                        {endTimeText ? (
                          <div className="mt-1 text-sm font-bold text-slate-700">
                            〜{endTimeText}
                          </div>
                        ) : null}
                      </div>

                      <div
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${getReservationStatusClass(
                          reservation.status
                        )}`}
                      >
                        {getReservationStatusLabel(reservation.status)}
                      </div>
                    </div>

                    {hasGalleryReference(reservation.memo) ? (
                      <div className="mt-3 rounded-2xl bg-pink-100 px-3 py-2 text-xs font-bold text-pink-700">
                        💅 Aily Gallery参考デザインあり
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-1 gap-3">
                      <div className="rounded-2xl bg-white p-3">
                        <div className="text-xs text-slate-500">メニュー</div>
                        <div className="mt-1 text-sm font-bold leading-6 text-slate-900">
                          {reservation.menu || "メニュー未登録"}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white p-3">
                        <div className="text-xs text-slate-500">
                          担当スタッフ
                        </div>
                        <div className="mt-1 text-sm font-bold text-slate-900">
                          {staffName}
                        </div>
                      </div>

                      {customerMemo ? (
                        <div className="rounded-2xl bg-white p-3">
                          <div className="text-xs text-slate-500">備考</div>
                          <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {customerMemo}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}

              {upcomingReservations.length > 3 ? (
                <Link
                  href="/customer-app/history"
                  className="block w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700"
                >
                  すべての予約を見る
                </Link>
              ) : null}

              <Link
                href="/customer-app/reserve"
                className="block w-full rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
              >
                追加で予約する
              </Link>
            </div>
          )}
        </section>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
        >
          ログアウト
        </button>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {signedInNavItems.map((item) => {
            const isActive = item.key === "mypage";

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium transition ${
                  isActive
                    ? "bg-rose-50 text-rose-500"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="mt-1 leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
