"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type NailTipOrderRow = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  lucky_color: string | null;
  lucky_stone: string | null;
  nail_theme: string | null;
  design_request: string | null;
  size_status: string | null;
  delivery_request: string | null;
  status: string | null;
  created_at: string | null;
};

type InboundNailTipRequestRow = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  country: string | null;
  instagram_id: string | null;
  language: string | null;
  order_type: string | null;
  design_request: string | null;
  image_urls: string[] | null;
  status: string | null;
  quote_amount: number | null;
  payment_url: string | null;
  payment_status: string | null;
  shipping_company: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  created_at: string | null;
  recipient_name: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_phone: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
};

type UnifiedOrder = {
  id: string;
  kind: "domestic" | "inbound";
  customerName: string;
  status: string | null;
  createdAt: string | null;
  title: string;
  badgeText: string;
  badgeClassName: string;
  detailHref: string;
  designRequest: string | null;
  luckyColor?: string | null;
  luckyStone?: string | null;
  nailTheme?: string | null;
  sizeStatus?: string | null;
  deliveryRequest?: string | null;
  country?: string | null;
  email?: string | null;
  instagramId?: string | null;
  orderType?: string | null;
  recipientName?: string | null;
  shippingAddress?: string | null;
  shippingPhone?: string | null;
};

const statusOptions = [
  { value: "requested", label: "注文相談中" },
  { value: "new", label: "新規" },
  { value: "reviewing", label: "確認中" },
  { value: "quoted", label: "見積済み" },
  { value: "payment_waiting", label: "支払待ち" },
  { value: "paid", label: "支払済み" },
  { value: "making", label: "制作中" },
  { value: "shipped", label: "発送済み" },
  { value: "completed", label: "完了" },
  { value: "cancelled", label: "キャンセル" },
];

function formatDateTime(value: string | null) {
  if (!value) return "未登録";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未登録";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function getStatusLabel(status: string | null) {
  return (
    statusOptions.find((item) => item.value === status)?.label ||
    status ||
    "未設定"
  );
}

function getStatusClass(status: string | null) {
  switch (status) {
    case "requested":
    case "new":
    case "reviewing":
      return "bg-purple-100 text-purple-700";
    case "quoted":
    case "payment_waiting":
      return "bg-orange-100 text-orange-700";
    case "paid":
      return "bg-emerald-100 text-emerald-700";
    case "making":
      return "bg-amber-100 text-amber-700";
    case "shipped":
      return "bg-blue-100 text-blue-700";
    case "completed":
      return "bg-slate-100 text-slate-700";
    case "cancelled":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getOrderTypeLabel(orderType: string | null) {
  switch (orderType) {
    case "anime_character":
      return "アニメネイル";
    case "fortune_sanmeigaku":
      return "算命学ネイル";
    case "power_stone":
      return "パワーストーンネイル";
    case "other":
      return "その他カスタム";
    default:
      return "海外カスタム";
  }
}

function getOrderCountByStatus(orders: UnifiedOrder[], status: string) {
  return orders.filter((order) => order.status === status).length;
}

export default function NailTipOrdersPageClient() {
  const [domesticOrders, setDomesticOrders] = useState<NailTipOrderRow[]>([]);
  const [inboundOrders, setInboundOrders] = useState<InboundNailTipRequestRow[]>(
    []
  );
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchOrders() {
    setLoading(true);

    try {
      const [domesticResponse, inboundResponse, customersRes] =
        await Promise.all([
          fetch("/api/nail-tip-orders/admin", {
            cache: "no-store",
          }),
          fetch("/api/inbound-nail-tip-requests/admin", {
            cache: "no-store",
          }),
          supabase.from("customers").select("id, name"),
        ]);

      const domesticJson = await domesticResponse.json();
      const inboundJson = await inboundResponse.json();

      if (!domesticJson.ok) {
        console.error("nail_tip_orders api error:", domesticJson.error);
        setDomesticOrders([]);
      } else {
        setDomesticOrders((domesticJson.orders || []) as NailTipOrderRow[]);
      }

      if (!inboundJson.ok) {
        console.error(
          "inbound_nail_tip_requests api error:",
          inboundJson.error
        );
        setInboundOrders([]);
      } else {
        setInboundOrders(
          (inboundJson.requests || []) as InboundNailTipRequestRow[]
        );
      }

      if (customersRes.error) {
        console.error("customers fetch error:", customersRes.error.message);
        setCustomers([]);
      } else {
        setCustomers((customersRes.data || []) as CustomerRow[]);
      }
    } catch (error) {
      console.error(error);
      setDomesticOrders([]);
      setInboundOrders([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void fetchOrders();
  }, []);

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();

    customers.forEach((customer) => {
      map.set(customer.id, customer.name || "顧客名未設定");
    });

    return map;
  }, [customers]);

  const unifiedOrders = useMemo<UnifiedOrder[]>(() => {
    const domesticItems: UnifiedOrder[] = domesticOrders.map((order) => {
      const customerName = order.customer_id
        ? customerMap.get(order.customer_id) || "顧客名未設定"
        : "顧客未設定";

      return {
        id: order.id,
        kind: "domestic",
        customerName,
        status: order.status,
        createdAt: order.created_at,
        title: "国内ネイルチップ注文",
        badgeText: "✨ AI診断",
        badgeClassName: "bg-pink-100 text-pink-700",
        detailHref: `/nail-tip-orders/${order.id}`,
        designRequest: order.design_request,
        luckyColor: order.lucky_color,
        luckyStone: order.lucky_stone,
        nailTheme: order.nail_theme,
        sizeStatus: order.size_status,
        deliveryRequest: order.delivery_request,
      };
    });

    const inboundItems: UnifiedOrder[] = inboundOrders.map((request) => {
      return {
        id: request.id,
        kind: "inbound",
        customerName: request.customer_name || "名前未登録",
        status: request.status,
        createdAt: request.created_at,
        title: getOrderTypeLabel(request.order_type),
        badgeText: "🌏 海外通販",
        badgeClassName: "bg-blue-100 text-blue-700",
        detailHref: "/inbound-nail-tip-requests",
        designRequest: request.design_request,
        country: request.country,
        email: request.customer_email,
        instagramId: request.instagram_id,
        orderType: request.order_type,
        recipientName: request.recipient_name,
        shippingAddress: request.shipping_address,
        shippingPhone: request.shipping_phone,
      };
    });

    return [...domesticItems, ...inboundItems].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [domesticOrders, inboundOrders, customerMap]);

  const orderCount = unifiedOrders.length;
  const domesticCount = domesticOrders.length;
  const inboundCount = inboundOrders.length;

  const paymentWaitingCount = useMemo(
    () => getOrderCountByStatus(unifiedOrders, "payment_waiting"),
    [unifiedOrders]
  );

  const paidCount = useMemo(
    () => getOrderCountByStatus(unifiedOrders, "paid"),
    [unifiedOrders]
  );

  const makingCount = useMemo(
    () => getOrderCountByStatus(unifiedOrders, "making"),
    [unifiedOrders]
  );

  const shippedCount = useMemo(
    () => getOrderCountByStatus(unifiedOrders, "shipped"),
    [unifiedOrders]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-purple-50/40">
        <div className="mx-auto w-full max-w-[920px] p-4 pb-24">
          <div className="rounded-3xl border bg-white p-4 text-sm text-slate-500 shadow-sm">
            読み込み中...
          </div>
        </div>
      </main>
    );
  }
    return (
    <main className="min-h-screen bg-purple-50/40">
      <div className="mx-auto w-full max-w-[920px] space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold text-white">
                ネイルチップ注文管理
              </h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                国内AI診断注文と海外通販注文をまとめて確認できます。
              </p>
            </div>

            <Link
              href="/dashboard"
              className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-purple-600 shadow"
            >
              ダッシュボードへ
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Link
            href="/nail-tip-orders"
            className="rounded-3xl border border-purple-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <div className="text-xs font-bold tracking-wide text-purple-500">
              🇯🇵 DOMESTIC
            </div>

            <div className="mt-2 text-xl font-black text-slate-900">
              国内ネイルチップ注文
            </div>

            <div className="mt-2 text-sm leading-6 text-slate-600">
              算命学・開運・パワーストーンネイル注文を管理します。
            </div>

            <div className="mt-4 text-2xl font-black text-purple-700">
              {domesticCount.toLocaleString()}件
            </div>
          </Link>

          <Link
            href="/inbound-nail-tip-requests"
            className="rounded-3xl border border-pink-200 bg-pink-50 p-5 shadow-sm transition hover:shadow-md"
          >
            <div className="text-xs font-bold tracking-wide text-pink-500">
              🌏 INTERNATIONAL
            </div>

            <div className="mt-2 text-xl font-black text-slate-900">
              海外ネイルチップ注文
            </div>

            <div className="mt-2 text-sm leading-6 text-slate-600">
              Anime・Character・Fortune・Power Stone・Custom Design の海外注文を管理します。
            </div>

            <div className="mt-4 text-2xl font-black text-pink-700">
              {inboundCount.toLocaleString()}件
            </div>
          </Link>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-purple-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">総注文数</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {orderCount.toLocaleString()}件
            </div>
            <div className="mt-2 text-sm text-slate-500">
              国内・海外を含む総数
            </div>
          </div>

          <div className="rounded-3xl border border-orange-100 bg-orange-50 p-4 shadow-sm">
            <div className="text-sm text-orange-600">支払待ち</div>
            <div className="mt-2 text-2xl font-bold text-orange-700">
              {paymentWaitingCount.toLocaleString()}件
            </div>
            <div className="mt-2 text-sm text-orange-600">
              決済案内が必要な注文
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
            <div className="text-sm text-emerald-600">支払済み</div>
            <div className="mt-2 text-2xl font-bold text-emerald-700">
              {paidCount.toLocaleString()}件
            </div>
            <div className="mt-2 text-sm text-emerald-600">
              制作開始できる注文
            </div>
          </div>

          <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
            <div className="text-sm text-amber-600">制作中</div>
            <div className="mt-2 text-2xl font-bold text-amber-700">
              {makingCount.toLocaleString()}件
            </div>
            <div className="mt-2 text-sm text-amber-600">発送前の注文</div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
            <div className="text-sm text-blue-600">発送済み</div>
            <div className="mt-2 text-2xl font-bold text-blue-700">
              {shippedCount.toLocaleString()}件
            </div>
            <div className="mt-2 text-sm text-blue-600">
              お客様へ発送済みの注文
            </div>
          </div>

          <div className="rounded-3xl border border-purple-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">運用メモ</div>
            <div className="mt-2 text-base font-bold text-slate-900">
              国内注文と海外注文を統合表示
            </div>
            <div className="mt-2 text-sm text-slate-500">
              海外注文の見積・決済URL・発送管理は「海外ネイルチップ注文」画面から行います。
            </div>
          </div>
        </section>

        {unifiedOrders.length === 0 ? (
          <section className="rounded-[28px] border border-purple-100 bg-white p-5 text-center text-sm text-slate-500 shadow-sm">
            ネイルチップ注文はまだありません。
          </section>
        ) : (
          <section className="space-y-3">
            {unifiedOrders.map((order) => {
              return (
                <article
                  key={`${order.kind}-${order.id}`}
                  className="rounded-[28px] border border-purple-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-bold text-slate-900">
                          {order.customerName}
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusClass(
                            order.status
                          )}`}
                        >
                          {getStatusLabel(order.status)}
                        </span>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${order.badgeClassName}`}
                        >
                          {order.badgeText}
                        </span>
                      </div>

                      <div className="mt-2 text-sm font-bold text-slate-700">
                        {order.title}
                      </div>

                      {order.kind === "domestic" ? (
                        <div className="mt-3 grid gap-3 text-sm text-slate-700">
                          <div className="rounded-2xl bg-purple-50 p-4">
                            <div className="text-xs text-purple-500">
                              ラッキーカラー
                            </div>
                            <div className="mt-1 font-bold text-purple-900">
                              {order.luckyColor || "未登録"}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-pink-50 p-4">
                            <div className="text-xs text-pink-500">
                              ラッキーストーン
                            </div>
                            <div className="mt-1 font-bold text-pink-900">
                              {order.luckyStone || "未登録"}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-amber-50 p-4">
                            <div className="text-xs text-amber-600">
                              おすすめ方向性
                            </div>
                            <div className="mt-1 font-bold leading-6 text-amber-900">
                              {order.nailTheme || "未登録"}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 grid gap-3 text-sm text-slate-700">
                          <div className="rounded-2xl bg-blue-50 p-4">
                            <div className="text-xs text-blue-600">
                              海外注文情報
                            </div>
                            <div className="mt-1 font-bold leading-6 text-blue-900">
                              国：{order.country || "未登録"}
                              <br />
                              メール：{order.email || "未登録"}
                              <br />
                              Instagram：{order.instagramId || "未登録"}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-purple-50 p-4">
                            <div className="text-xs text-purple-600">
                              配送先
                            </div>
                            <div className="mt-1 font-bold leading-6 text-purple-900">
                              受取人：{order.recipientName || "未登録"}
                              <br />
                              住所：{order.shippingAddress || "未登録"}
                              <br />
                              電話：{order.shippingPhone || "未登録"}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                        <div className="text-xs text-slate-500">
                          デザイン希望
                        </div>
                        <div className="mt-1 whitespace-pre-wrap leading-6">
                          {order.designRequest?.trim()
                            ? order.designRequest
                            : "未入力"}
                        </div>
                      </div>

                      {order.kind === "domestic" ? (
                        <>
                          <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                            <div className="text-xs text-slate-500">
                              サイズ状態
                            </div>
                            <div className="mt-1 font-bold">
                              {order.sizeStatus || "未設定"}
                            </div>
                          </div>

                          <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                            <div className="text-xs text-slate-500">
                              配送・納期希望
                            </div>
                            <div className="mt-1 whitespace-pre-wrap leading-6">
                              {order.deliveryRequest?.trim()
                                ? order.deliveryRequest
                                : "未入力"}
                            </div>
                          </div>
                        </>
                      ) : null}

                      <div className="mt-3 text-xs text-slate-400">
                        注文日時：{formatDateTime(order.createdAt)}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={order.detailHref}
                          className="rounded-2xl bg-purple-600 px-4 py-2 text-xs font-bold text-white"
                        >
                          {order.kind === "domestic"
                            ? "詳細を見る"
                            : "海外注文管理へ"}
                        </Link>

                        {order.kind === "domestic" ? (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                const { error } = await supabase
                                  .from("nail_tip_orders")
                                  .update({
                                    status: "making",
                                  })
                                  .eq("id", order.id);

                                if (!error) {
                                  void fetchOrders();
                                }
                              }}
                              className="rounded-2xl bg-amber-500 px-4 py-2 text-xs font-bold text-white"
                            >
                              制作中へ
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                const { error } = await supabase
                                  .from("nail_tip_orders")
                                  .update({
                                    status: "shipped",
                                  })
                                  .eq("id", order.id);

                                if (!error) {
                                  void fetchOrders();
                                }
                              }}
                              className="rounded-2xl bg-blue-500 px-4 py-2 text-xs font-bold text-white"
                            >
                              発送済みへ
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                const { error } = await supabase
                                  .from("nail_tip_orders")
                                  .update({
                                    status: "completed",
                                  })
                                  .eq("id", order.id);

                                if (!error) {
                                  void fetchOrders();
                                }
                              }}
                              className="rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white"
                            >
                              完了へ
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}