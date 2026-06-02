"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRow = {
  id: string;
  name: string | null;
};

type VisitRow = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  menu: string | null;
  menu_name: string | null;
  memo: string | null;
  next_proposal: string | null;
  staff_name: string | null;
  created_at: string | null;
};

type VisitPhotoRow = {
  id: string;
  visit_id: string | null;
  image_url: string | null;
  photo_type: string | null;
  created_at: string | null;
};

type ReservationRow = {
  id: string;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  memo: string | null;
  status: string | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string | null;
};

type StaffRow = {
  id: string;
  name: string | null;
};

type DiagnosisRow = {
  id: string;
  lucky_color: string | null;
  lucky_stone: string | null;
  nail_theme: string | null;
  diagnosis_message: string | null;
  created_at: string | null;
};

type NailTipOrderRow = {
  id: string;
  lucky_color: string | null;
  lucky_stone: string | null;
  nail_theme: string | null;
  design_request: string | null;
  size_status: string | null;
  delivery_request: string | null;
  status: string | null;
  created_at: string | null;
};

type MeResponse = {
  authenticated: boolean;
  customer?: CustomerRow | null;
};

const signedInNavItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  {
    key: "diagnosis",
    label: "診断",
    icon: "✨",
    href: "/customer-app/sanmeigaku",
  },
  { key: "history", label: "履歴", icon: "📝", href: "/customer-app/history" },
  { key: "mypage", label: "マイ", icon: "👤", href: "/customer-app/mypage" },
];

function formatDate(value: string | null) {
  if (!value) return "未登録";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "未登録";

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "未登録";

  const normalizedValue =
    value.includes("Z") || value.includes("+")
      ? value
      : `${value}Z`;

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) return "未登録";

  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDisplayMenu(visit: VisitRow) {
  if (visit.menu_name?.trim()) return visit.menu_name.trim();
  if (visit.menu?.trim()) return visit.menu.trim();
  return "メニュー未登録";
}

function buildRepeatReservationHref(visit: VisitRow) {
  const params = new URLSearchParams();

  params.set("design", visit.id);

  const menu = getDisplayMenu(visit);
  if (menu && menu !== "メニュー未登録") {
    params.set("menu", menu);
  }

  return `/customer-app/reserve?${params.toString()}`;
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
    default:
      return status || "未設定";
  }
}

function getNailTipStatusLabel(status: string | null) {
  switch (status) {
    case "requested":
      return "注文相談中";
    case "making":
      return "制作中";
    case "shipped":
      return "発送済み";
    case "completed":
      return "完了";
    case "cancelled":
      return "キャンセル";
    default:
      return status || "未設定";
  }
}

export default function CustomerAppHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [customerName, setCustomerName] = useState("お客様");

  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [visitPhotos, setVisitPhotos] = useState<VisitPhotoRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [diagnoses, setDiagnoses] = useState<DiagnosisRow[]>([]);
  const [nailTipOrders, setNailTipOrders] = useState<NailTipOrderRow[]>([]);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setErrorMessage("");
      setNoticeMessage("");

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

        setIsLoggedIn(true);

        const currentCustomer = meJson.customer;
        setCustomerName(currentCustomer.name || "お客様");

        const visitResponse = await supabase
          .from("visits")
          .select(
            "id, customer_id, visit_date, menu, menu_name, memo, next_proposal, staff_name, created_at"
          )
          .eq("customer_id", currentCustomer.id)
          .order("visit_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (visitResponse.error) {
          console.error("visits取得エラー:", visitResponse.error);
          setErrorMessage("来店履歴の取得に失敗しました。");
          setVisits([]);
          setVisitPhotos([]);
        } else {
          const nextVisits = (visitResponse.data || []) as VisitRow[];
          setVisits(nextVisits);

          const visitIds = nextVisits.map((visit) => visit.id).filter(Boolean);

          if (visitIds.length > 0) {
            const photoResponse = await supabase
              .from("visit_photos")
              .select("id, visit_id, image_url, photo_type, created_at")
              .in("visit_id", visitIds)
              .order("created_at", { ascending: true });

            if (photoResponse.error) {
              console.error("visit_photos取得エラー:", photoResponse.error);
              setVisitPhotos([]);
              setNoticeMessage("施術写真の一部取得に失敗しました。");
            } else {
              setVisitPhotos((photoResponse.data || []) as VisitPhotoRow[]);
            }
          } else {
            setVisitPhotos([]);
          }
        }

        const reservationResponse = await supabase
          .from("reservations")
          .select(
            "id, customer_id, staff_id, menu, memo, status, start_at, end_at, created_at"
          )
          .eq("customer_id", currentCustomer.id)
          .order("start_at", { ascending: false });

        if (reservationResponse.error) {
          console.error("reservations取得エラー:", reservationResponse.error);
          setReservations([]);
          setNoticeMessage("予約情報の一部取得に失敗しました。");
        } else {
          setReservations((reservationResponse.data || []) as ReservationRow[]);
        }

        const staffResponse = await supabase.from("staffs").select("id, name");

        if (staffResponse.error) {
          console.error("staffs取得エラー:", staffResponse.error);
          setStaffs([]);
        } else {
          setStaffs((staffResponse.data || []) as StaffRow[]);
        }

        const diagnosisResponse = await supabase
          .from("sanmeigaku_diagnoses")
          .select(
            "id, lucky_color, lucky_stone, nail_theme, diagnosis_message, created_at"
          )
          .eq("customer_id", currentCustomer.id)
          .order("created_at", { ascending: false });

        if (diagnosisResponse.error) {
          console.error("sanmeigaku_diagnoses取得エラー:", diagnosisResponse.error);
          setDiagnoses([]);
        } else {
          setDiagnoses((diagnosisResponse.data || []) as DiagnosisRow[]);
        }

        const nailTipOrderResponse = await supabase
          .from("nail_tip_orders")
          .select(
            "id, lucky_color, lucky_stone, nail_theme, design_request, size_status, delivery_request, status, created_at"
          )
          .eq("customer_id", currentCustomer.id)
          .order("created_at", { ascending: false });

        if (nailTipOrderResponse.error) {
          console.error("nail_tip_orders取得エラー:", nailTipOrderResponse.error);
          setNailTipOrders([]);
        } else {
          setNailTipOrders(
            (nailTipOrderResponse.data || []) as NailTipOrderRow[]
          );
        }
      } catch (error) {
        console.error("履歴ページ読み込みエラー:", error);
        setErrorMessage("読み込みに失敗しました。");
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, []);

  const staffMap = useMemo(() => {
    const map = new Map<string, string>();

    staffs.forEach((staff) => {
      if (staff.id) {
        map.set(staff.id, staff.name || "未設定");
      }
    });

    return map;
  }, [staffs]);

  const visitPhotoMap = useMemo(() => {
    const map = new Map<string, VisitPhotoRow[]>();

    visitPhotos.forEach((photo) => {
      if (!photo.visit_id) return;

      const current = map.get(photo.visit_id) || [];
      current.push(photo);
      map.set(photo.visit_id, current);
    });

    return map;
  }, [visitPhotos]);

  const visitCount = visits.length;

  const lastVisitDate = useMemo(() => {
    return visits[0]?.visit_date ? formatDate(visits[0].visit_date) : "未登録";
  }, [visits]);

  const recentSuggestion = useMemo(() => {
    const latest = visits.find((item) => item.next_proposal?.trim());

    return latest?.next_proposal?.trim() || "次回提案はまだ登録されていません";
  }, [visits]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 pb-6 pt-4">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">来店履歴</div>
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

            <h1 className="mt-2 text-2xl font-bold leading-tight">来店履歴</h1>

            <p className="mt-3 text-sm leading-6 text-white/90">
              来店履歴はLINEログイン後に確認できます。
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <Link
                href="/customer-app/login"
                className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-900"
              >
                LINEでログイン
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>

          <h1 className="mt-2 text-2xl font-bold leading-tight">来店履歴</h1>

          <p className="mt-3 text-sm leading-6 text-white/90">
            {customerName}様の予約状況・来店履歴・施術写真を確認できます。
          </p>
        </section>

        {errorMessage ? (
          <section className="rounded-3xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
            {errorMessage}
          </section>
        ) : null}

        {noticeMessage ? (
          <section className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-700 shadow-sm">
            {noticeMessage}
          </section>
        ) : null}

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            履歴サマリー
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">累計来店回数</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {visitCount}回
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">前回来店日</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {lastVisitDate}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">最近の次回提案</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {recentSuggestion}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-lg font-bold text-slate-900">予約状況</div>

          {reservations.length === 0 ? (
            <div className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">
                予約中データはありません。
              </div>
            </div>
          ) : (
            reservations.map((item) => {
              const isAiReservation =
                item.menu?.includes("開運") || item.memo?.includes("AI算命学");

              return (
                <article
                  key={item.id}
                  className="rounded-3xl border bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-lg font-bold text-slate-900">
                      {item.menu || "メニュー未設定"}
                    </div>

                    <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                      {getReservationStatusLabel(item.status)}
                    </div>
                  </div>

                  {isAiReservation ? (
                    <div className="mt-3 rounded-2xl bg-pink-50 px-3 py-2 text-sm font-bold text-pink-700">
                      ✨ AI算命学診断からの予約
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">予約日時</div>
                      <div className="mt-1 text-base font-bold text-slate-900">
                        {formatDateTime(item.start_at)}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">
                        担当スタッフ
                      </div>
                      <div className="mt-1 text-base font-bold text-slate-900">
                        {item.staff_id
                          ? staffMap.get(item.staff_id) || "未設定"
                          : "指名なし"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">ご要望・備考</div>
                      <div className="mt-1 text-sm leading-6 text-slate-700">
                        {item.memo?.trim() ? item.memo : "備考はありません"}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>

        <section className="space-y-3">
          <div className="text-lg font-bold text-slate-900">来店履歴</div>

          {visits.length === 0 ? (
            <div className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">
                まだ来店履歴がありません。
              </div>
            </div>
          ) : (
            visits.map((item) => {
              const photos = visitPhotoMap.get(item.id) || [];
              const repeatHref = buildRepeatReservationHref(item);

              return (
                <article
                  key={item.id}
                  className="rounded-3xl border bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-lg font-bold text-slate-900">
                      {getDisplayMenu(item)}
                    </div>

                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                      {formatDate(item.visit_date)}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">
                        担当スタッフ
                      </div>
                      <div className="mt-1 text-base font-bold text-slate-900">
                        {item.staff_name?.trim() ? item.staff_name : "未登録"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">施術メモ</div>
                      <div className="mt-1 text-sm leading-6 text-slate-700">
                        {item.memo?.trim() ? item.memo : "メモはまだありません"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-rose-50 p-4">
                      <div className="text-xs text-rose-500">次回提案</div>
                      <div className="mt-1 text-sm font-bold leading-6 text-rose-700">
                        {item.next_proposal?.trim()
                          ? item.next_proposal
                          : "次回提案はまだありません"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">施術写真</div>

                      {photos.length === 0 ? (
                        <div className="mt-2 text-sm text-slate-500">
                          写真はまだ登録されていません。
                        </div>
                      ) : (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          {photos.map((photo) =>
                            photo.image_url ? (
                              <a
                                key={photo.id}
                                href={photo.image_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block overflow-hidden rounded-2xl border bg-white shadow-sm"
                              >
                                <img
                                  src={photo.image_url}
                                  alt="施術写真"
                                  className="h-32 w-full object-cover"
                                />
                              </a>
                            ) : null
                          )}
                        </div>
                      )}
                    </div>

                    <Link
                      href={repeatHref}
                      className="block rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white shadow-sm"
                    >
                      このデザインで再予約する
                    </Link>
                  </div>
                </article>
              );
            })
          )}
        </section>

        <section className="space-y-3">
          <div>
            <div className="text-xs font-black tracking-[0.25em] text-fuchsia-500">
              AI BEAUTY ORACLE
            </div>

            <div className="mt-1 text-lg font-black text-slate-900">
              AI算命学診断履歴
            </div>
          </div>

          {diagnoses.length === 0 ? (
            <div className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">
                まだ診断履歴がありません。
              </div>
            </div>
          ) : (
            diagnoses.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-[32px] border border-fuchsia-100 bg-gradient-to-br from-white to-fuchsia-50 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg font-bold text-slate-900">
                    開運ネイル診断
                  </div>

                  <div className="rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-500 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-white shadow">
                    {formatDate(item.created_at)}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
                    <div className="text-xs text-slate-500">
                      ラッキーカラー
                    </div>
                    <div className="mt-1 text-base font-bold text-slate-900">
                      {item.lucky_color || "未登録"}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
                    <div className="text-xs text-slate-500">
                      ラッキーストーン
                    </div>
                    <div className="mt-1 text-base font-bold text-slate-900">
                      {item.lucky_stone || "未登録"}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
                    <div className="text-xs text-slate-500">
                      おすすめネイル方向性
                    </div>
                    <div className="mt-1 text-sm font-bold leading-6 text-slate-900">
                      {item.nail_theme || "未登録"}
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-lg font-bold text-slate-900">
              ネイルチップ注文履歴
            </div>

            <div className="rounded-full bg-pink-100 px-3 py-1 text-xs font-bold text-pink-700">
              {nailTipOrders.length}件
            </div>
          </div>

          {nailTipOrders.length === 0 ? (
            <div className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">
                ネイルチップ注文履歴はまだありません。
              </div>
            </div>
          ) : (
            nailTipOrders.map((order) => (
              <article
                key={order.id}
                className="rounded-3xl border border-pink-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg font-bold text-slate-900">
                    開運ネイルチップ相談
                  </div>

                  <div className="rounded-full bg-pink-100 px-3 py-1 text-xs font-bold text-pink-700">
                    {getNailTipStatusLabel(order.status)}
                  </div>
                </div>

                <div className="mt-3 text-xs text-slate-400">
                  注文日：{formatDate(order.created_at)}
                </div>
              </article>
            ))
          )}
        </section>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {signedInNavItems.map((item) => {
            const isActive = item.key === "history";

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