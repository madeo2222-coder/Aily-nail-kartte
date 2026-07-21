"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type NewsItem = {
  id: string;
  title: string;
  body: string;
  date: string;
  tag: string;
};

type MenuItem = {
  id: string;
  title: string;
  description: string;
  price: string;
};

type CustomerRow = {
  id: string;
  name: string | null;
  salon_id: string | null;
  line_user_id: string | null;
};

type SalonRow = {
  id: string;
  name: string | null;
};

type VisitRow = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  menu: string | null;
  menu_name?: string | null;
  memo: string | null;
  created_at: string | null;
};

type ReservationRow = {
  id: string;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  start_at: string | null;
  status: string | null;
};

type StaffRow = {
  id: string;
  name: string | null;
};

type LatestPhoto = {
  id: string;
  visitId: string;
  imageUrl: string;
  visitDate: string;
  menuName: string;
};

type MeResponse = {
  authenticated: boolean;
  customer?: CustomerRow | null;
};

const newsItems: NewsItem[] = [
  {
    id: "1",
    title: "新色マグネットジェル入荷しました",
    body: "春夏に人気の透明感カラーを追加しています。次回のご予約時にぜひご相談ください。",
    date: "2026/04/17",
    tag: "新着",
  },
  {
    id: "2",
    title: "GW期間の営業について",
    body: "連休中は営業時間が一部変則となります。ご希望日時はお早めにご予約ください。",
    date: "2026/04/15",
    tag: "営業案内",
  },
];

const recommendedMenus: MenuItem[] = [
  {
    id: "1",
    title: "初夏デザインコース",
    description:
      "透明感のある季節カラーとトレンドデザインを組み合わせたおすすめメニューです。",
    price: "¥7,700〜",
  },
  {
    id: "2",
    title: "フィルインメンテナンス",
    description:
      "前回施術の持ちを活かしながら負担を抑えてきれいな状態を保ちやすい人気メニューです。",
    price: "¥6,600〜",
  },
  {
    id: "3",
    title: "シンプルデザインコース",
    description:
      "オフィスでもなじみやすい上品デザインを中心に整えたい方へおすすめです。",
    price: "¥7,200〜",
  },
];

const signedInNavItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  { key: "gallery", label: "ギャラリー", icon: "💅", href: "/customer-app/gallery" },
  { key: "diagnosis", label: "診断", icon: "✨", href: "/customer-app/sanmeigaku" },
  { key: "mypage", label: "マイ", icon: "👤", href: "/customer-app/mypage" },
];

function formatDate(value: string | null) {
  if (!value) return "未登録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未登録";
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized =
    trimmed.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(trimmed)
      ? trimmed
      : `${trimmed.replace(" ", "T")}Z`;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  return `${map.get("year")}/${map.get("month")}/${map.get("day")} ${map.get("hour")}:${map.get("minute")}`;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function buildVisitWindowText(lastVisitDate: string | null) {
  if (!lastVisitDate) return "次回のおすすめ時期を準備中です";

  const date = new Date(lastVisitDate);
  if (Number.isNaN(date.getTime())) return "次回のおすすめ時期を準備中です";

  const from = addDays(date, 21);
  const to = addDays(date, 35);

  return `${from.getMonth() + 1}/${from.getDate()}〜${
    to.getMonth() + 1
  }/${to.getDate()}ごろ`;
}

export default function CustomerAppPage() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("お客様");
  const [salonName, setSalonName] = useState("Aily Nail Studio");
  const [nextVisitWindow, setNextVisitWindow] = useState(
    "次回のおすすめ時期を準備中です"
  );
  const [lastVisitDate, setLastVisitDate] = useState("未登録");
  const [lastMenu, setLastMenu] = useState("来店履歴を確認中です");
  const [lastStaff, setLastStaff] = useState("未登録");
  const [nextReservedAt, setNextReservedAt] = useState("");
  const [nextReservationId, setNextReservationId] = useState("");
  const [latestPhoto, setLatestPhoto] = useState<LatestPhoto | null>(null);

  useEffect(() => {
    async function fetchPageData() {
      setLoading(true);
      setErrorMessage("");

      try {
        const meRes = await fetch("/api/line-login/me", { cache: "no-store" });
        const meJson = (await meRes.json()) as MeResponse;

        if (!meJson.authenticated || !meJson.customer) {
          setIsLoggedIn(false);
          setLoading(false);
          return;
        }

        const currentCustomer = meJson.customer;
        setIsLoggedIn(true);
        setCustomerId(currentCustomer.id);
        setCustomerName(currentCustomer.name || "お客様");

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

        const { data: latestVisitData } = await supabase
          .from("visits")
          .select("id, customer_id, visit_date, menu, menu_name, memo, created_at")
          .eq("customer_id", currentCustomer.id)
          .order("visit_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        const latestVisit =
          ((latestVisitData || [])[0] as VisitRow | undefined) || null;

        if (latestVisit) {
          const displayMenu =
            latestVisit.menu_name || latestVisit.menu || "メニュー未登録";

          setLastVisitDate(formatDate(latestVisit.visit_date));
          setLastMenu(displayMenu);
          setNextVisitWindow(buildVisitWindowText(latestVisit.visit_date));

          const { data: latestPhotoData } = await supabase
            .from("visit_photos")
            .select("id, visit_id, image_url, created_at")
            .eq("visit_id", latestVisit.id)
            .not("image_url", "is", null)
            .order("created_at", { ascending: false })
            .limit(1);

          const photo = (latestPhotoData || [])[0] as
            | {
                id: string;
                visit_id: string;
                image_url: string | null;
                created_at: string | null;
              }
            | undefined;

          if (photo?.image_url) {
            setLatestPhoto({
              id: photo.id,
              visitId: photo.visit_id,
              imageUrl: photo.image_url,
              visitDate: formatDate(latestVisit.visit_date),
              menuName: displayMenu,
            });
          } else {
            setLatestPhoto(null);
          }
        } else {
          setLastVisitDate("未登録");
          setLastMenu("まだ来店履歴がありません");
          setNextVisitWindow("初回ご予約をお待ちしています");
          setLatestPhoto(null);
        }

        const nowIso = new Date().toISOString();

        const { data: nextReservationData } = await supabase
          .from("reservations")
          .select("id, customer_id, staff_id, menu, start_at, status")
          .eq("customer_id", currentCustomer.id)
          .neq("status", "キャンセル")
          .gte("start_at", nowIso)
          .order("start_at", { ascending: true })
          .limit(1);

        const nextReservation =
          ((nextReservationData || [])[0] as ReservationRow | undefined) ||
          null;

        if (nextReservation) {
          setNextReservationId(nextReservation.id);
          setNextReservedAt(formatDateTime(nextReservation.start_at));

          if (nextReservation.staff_id) {
            const { data: staffData } = await supabase
              .from("staffs")
              .select("id, name")
              .eq("id", nextReservation.staff_id)
              .single();

            if (staffData) {
              const staff = staffData as StaffRow;
              setLastStaff(staff.name || "未登録");
            }
          }
        } else {
          setNextReservationId("");
          setNextReservedAt("");
        }

        if (!nextReservation) {
          const { data: latestReservationData } = await supabase
            .from("reservations")
            .select("id, customer_id, staff_id, menu, start_at, status")
            .eq("customer_id", currentCustomer.id)
            .neq("status", "キャンセル")
            .order("start_at", { ascending: false })
            .limit(1);

          const latestReservation =
            ((latestReservationData || [])[0] as ReservationRow | undefined) ||
            null;

          if (latestReservation?.staff_id) {
            const { data: staffData } = await supabase
              .from("staffs")
              .select("id, name")
              .eq("id", latestReservation.staff_id)
              .single();

            if (staffData) {
              const staff = staffData as StaffRow;
              setLastStaff(staff.name || "未登録");
            }
          }
        }
      } catch {
        setErrorMessage("読み込みに失敗しました。");
      } finally {
        setLoading(false);
      }
    }

    fetchPageData();
  }, []);

  const heroStatusText = useMemo(() => {
    if (nextReservedAt) {
      return `次回予約：${nextReservedAt}`;
    }
    return "そろそろご来店のおすすめ時期です";
  }, [nextReservedAt]);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

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
            <div className="text-base font-bold text-slate-900">
              Ailyマイページ
            </div>
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
          <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 p-5 text-white shadow">
            <div className="text-xs font-bold tracking-wide opacity-90">
              AILY MY PAGE
            </div>
            <div className="mt-2 text-sm opacity-90">Aily Nail Studio</div>
            <h1 className="mt-2 text-2xl font-bold leading-tight">
              LINEからのご来店ありがとうございます
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/90">
              はじめての方は初回入力へ、会員の方はLINEログインして来店履歴やご予約確認へお進みください。
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <Link
                href="/customer-intake"
                className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-rose-500"
              >
                はじめての方はこちら
              </Link>
              <Link
                href="/customer-app/login"
                className="rounded-xl border border-white/30 px-4 py-3 text-center text-sm font-bold text-white"
              >
                LINEでログイン
              </Link>
            </div>
          </section>

          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="text-base font-bold text-slate-900">
              ご利用メニュー
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <Link
                href="/customer-intake"
                className="rounded-2xl bg-slate-50 p-4 transition hover:bg-rose-50"
              >
                <div className="text-sm font-bold text-slate-900">初回入力</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  初めてご来店の方はこちらから、事前確認とご署名をお願いします。
                </div>
              </Link>

              <Link
                href="/customer-app/login"
                className="rounded-2xl bg-slate-50 p-4 transition hover:bg-rose-50"
              >
                <div className="text-sm font-bold text-slate-900">
                  Ailyマイページへログイン
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  LINEログインで来店履歴・次回提案・今後のご予約確認ができます。
                </div>
              </Link>

              <Link
                href="/customer-app/reserve"
                className="rounded-2xl bg-slate-50 p-4 transition hover:bg-rose-50"
              >
                <div className="text-sm font-bold text-slate-900">予約する</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  ご希望日時の確認や次回予約の入口としてご利用ください。
                </div>
              </Link>
            </div>
          </section>

          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold text-slate-900">
                今月のおすすめ
              </div>
              <div className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-600">
                おすすめ
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {recommendedMenus.map((menu) => (
                <div key={menu.id} className="rounded-2xl border bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {menu.title}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">
                        {menu.description}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700">
                      {menu.price}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 pb-6 pt-4">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">
              Ailyマイページ
            </div>
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {errorMessage}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <Link
                href="/customer-app/login"
                className="block w-full rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
              >
                ログイン画面へ
              </Link>
            </div>
          </div>
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
            こんにちは、{customerName}様
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            次回のご来店時期やおすすめメニュー、最新のお知らせをここでまとめて確認できます。
          </p>

          <div className="mt-4 rounded-2xl bg-white/15 p-4 backdrop-blur-sm">
            <div className="text-xs font-medium text-white/80">現在のご案内</div>
            <div className="mt-2 text-lg font-bold">{heroStatusText}</div>
            <div className="mt-3 flex gap-2">
              <Link
                href="/customer-app/reserve"
                className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-rose-500"
              >
                予約する
              </Link>
              <Link
                href={
                  nextReservationId
                    ? `/customer-app/reservations/${nextReservationId}`
                    : "/customer-app/history"
                }
                className="rounded-xl border border-white/30 px-4 py-2 text-sm font-bold text-white"
              >
                {nextReservationId ? "予約内容を見る" : "予約確認"}
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">次回来店のおすすめ</div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {nextVisitWindow}
              </div>
            </div>
            <div className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-600">
              再来のおすすめ
            </div>
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            きれいな状態を保ちやすい時期を目安にご案内しています。前回内容に合わせた次回メニュー提案にもつなげていきます。
          </p>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="text-sm font-bold text-slate-900">
              おすすめメニュー
            </div>
            <div className="mt-2 text-sm text-slate-600">
              フィルインメンテナンス / 季節デザインコース
            </div>
          </div>

          <Link
            href="/customer-app/reserve"
            className="mt-4 block w-full rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
          >
            次回予約する
          </Link>
        </section>

        {latestPhoto ? (
          <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-500">最新施術写真</div>
                  <div className="mt-1 text-xl font-bold text-slate-900">
                    前回のネイルデザイン
                  </div>
                </div>

                <Link
                  href="/customer-app/gallery"
                  className="text-sm font-bold text-rose-500"
                >
                  写真一覧
                </Link>
              </div>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                前回の施術写真を確認できます。次回デザインの参考にしてください。
              </p>
            </div>

            <Link href="/customer-app/gallery" className="block">
              <img
                src={latestPhoto.imageUrl}
                alt="最新施術写真"
                className="h-64 w-full object-cover"
              />
            </Link>

            <div className="space-y-2 p-4">
              <div className="text-sm font-bold text-slate-900">
                {latestPhoto.menuName}
              </div>
              <div className="text-xs text-slate-500">
                施術日：{latestPhoto.visitDate}
              </div>

              <Link
                href="/customer-app/gallery"
                className="mt-3 block rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
              >
                施術写真を見る
              </Link>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 p-5 text-white shadow">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold tracking-[0.2em] text-white/80">
                AI FORTUNE BEAUTY
              </div>

              <div className="mt-2 text-2xl font-bold leading-tight">
                今日の開運ビューティー
              </div>

              <div className="mt-3 text-sm leading-6 text-white/90">
                今のあなたは「魅力運」と「人間関係運」を整えるタイミングです。
                透明感カラーやジュエリーパーツを取り入れた、印象を彩るデザインをご提案します。
              </div>
            </div>

            <div className="rounded-2xl bg-white/15 px-3 py-2 text-right backdrop-blur-sm">
              <div className="text-[11px] text-white/70">Lucky Stone</div>

              <div className="mt-1 text-sm font-bold">Jewelry Accent</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur-sm">
              <div className="text-[11px] text-white/70">ラッキーカラー</div>

              <div className="mt-1 text-sm font-bold">シャンパンゴールド</div>
            </div>

            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur-sm">
              <div className="text-[11px] text-white/70">おすすめ運気</div>

              <div className="mt-1 text-sm font-bold">恋愛運・人気運</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2">
            <Link
              href="/customer-app/sanmeigaku"
              className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-fuchsia-600"
            >
              AI算命学ネイル診断をする
            </Link>

            <Link
              href="/customer-app/nail-tip-order"
              className="rounded-2xl border border-white/30 px-4 py-3 text-center text-sm font-bold text-white"
            >
              開運ネイルチップを見る
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">BEAUTY STORE</div>

              <div className="mt-1 text-xl font-bold text-slate-900">
                ネイルチップ相談
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <Link
              href="/customer-app/nail-tip-order"
              className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50 p-4 transition hover:bg-fuchsia-100"
            >
              <div className="text-sm font-bold text-fuchsia-700">
                開運ネイルチップ
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                診断結果やご希望に合わせて、オーダーネイルチップをご相談いただけます。
              </div>
            </Link>

            <Link
              href="/customer-app/inbound"
              className="rounded-2xl border border-blue-100 bg-blue-50 p-4 transition hover:bg-blue-100"
            >
              <div className="text-sm font-bold text-blue-700">
                International Custom Nail Tips
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                Custom nail tip consultation and worldwide shipping requests.
              </div>
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-slate-900">
              前回来店の内容
            </div>
            <Link href="/customer-app/history" className="text-sm font-bold text-rose-500">
              履歴を見る
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">前回来店日</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {lastVisitDate}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">前回メニュー</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {lastMenu}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">担当スタッフ</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {lastStaff}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-slate-900">
              今月のおすすめ
            </div>
            <div className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-600">
              おすすめ
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {recommendedMenus.map((menu) => (
              <div key={menu.id} className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {menu.title}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-600">
                      {menu.description}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700">
                    {menu.price}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-slate-900">
              最新のお知らせ
            </div>
            <button
              type="button"
              onClick={() => showMessage("お知らせ一覧ページは次段階で実装します")}
              className="text-sm font-bold text-rose-500"
            >
              もっと見る
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {newsItems.map((item) => (
              <div key={item.id} className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-600">
                    {item.tag}
                  </div>
                  <div className="text-xs text-slate-400">{item.date}</div>
                </div>
                <div className="mt-3 text-sm font-bold text-slate-900">
                  {item.title}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {item.body}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="rounded-3xl border bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
          >
            ログアウト
          </button>
        </div>
      </div>

      {message ? (
        <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-24px)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-blue-700">{message}</div>
              <button
                type="button"
                onClick={() => setMessage("")}
                className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-bold text-blue-700"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {signedInNavItems.map((item) => {
            const isActive = item.key === "home";

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
