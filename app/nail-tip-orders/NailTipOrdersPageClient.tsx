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

type CustomerRow = {
  id: string;
  name: string | null;
};

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

function getStatusClass(status: string | null) {
  switch (status) {
    case "requested":
      return "bg-purple-100 text-purple-700";
    case "making":
      return "bg-amber-100 text-amber-700";
    case "shipped":
      return "bg-blue-100 text-blue-700";
    case "completed":
      return "bg-emerald-100 text-emerald-700";
    case "cancelled":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function NailTipOrdersPageClient() {
  const [orders, setOrders] = useState<NailTipOrderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchOrders() {
    setLoading(true);

    const [ordersRes, customersRes] = await Promise.all([
      supabase
        .from("nail_tip_orders")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name"),
    ]);

    if (ordersRes.error) {
      console.error("nail_tip_orders fetch error:", ordersRes.error.message);
      setOrders([]);
    } else {
      setOrders((ordersRes.data || []) as NailTipOrderRow[]);
    }

    if (customersRes.error) {
      console.error("customers fetch error:", customersRes.error.message);
      setCustomers([]);
    } else {
      setCustomers((customersRes.data || []) as CustomerRow[]);
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

  const orderCount = orders.length;

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
                算命学ネイル診断から入ったネイルチップ注文相談を確認できます。
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

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-purple-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">注文相談件数</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {orderCount.toLocaleString()}件
            </div>
            <div className="mt-2 text-sm text-slate-500">
              ネイルチップ相談の総数
            </div>
          </div>

          <div className="rounded-3xl border border-purple-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">管理状態</div>
            <div className="mt-2 text-base font-bold text-slate-900">
              Supabase連携中
            </div>
            <div className="mt-2 text-sm text-slate-500">
              nail_tip_orders 取得OK
            </div>
          </div>

          <div className="rounded-3xl border border-purple-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">次の実装候補</div>
            <div className="mt-2 text-base font-bold text-slate-900">
              制作・発送管理
            </div>
            <div className="mt-2 text-sm text-slate-500">
              ステータス変更は次段階
            </div>
          </div>
        </section>

        {orders.length === 0 ? (
          <section className="rounded-[28px] border border-purple-100 bg-white p-5 text-center text-sm text-slate-500 shadow-sm">
            ネイルチップ注文はまだありません。
          </section>
        ) : (
          <section className="space-y-3">
            {orders.map((order) => {
              const customerName = order.customer_id
                ? customerMap.get(order.customer_id) || "顧客名未設定"
                : "顧客未設定";

              return (
                <article
                  key={order.id}
                  className="rounded-[28px] border border-purple-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-bold text-slate-900">
                          {customerName}
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusClass(
                            order.status
                          )}`}
                        >
                          {getStatusLabel(order.status)}
                        </span>

                        <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-bold text-pink-700">
                          ✨ AI診断
                        </span>
                      </div>

                      <div className="mt-3 grid gap-3 text-sm text-slate-700">
                        <div className="rounded-2xl bg-purple-50 p-4">
                          <div className="text-xs text-purple-500">
                            ラッキーカラー
                          </div>
                          <div className="mt-1 font-bold text-purple-900">
                            {order.lucky_color || "未登録"}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-pink-50 p-4">
                          <div className="text-xs text-pink-500">
                            ラッキーストーン
                          </div>
                          <div className="mt-1 font-bold text-pink-900">
                            {order.lucky_stone || "未登録"}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-amber-50 p-4">
                          <div className="text-xs text-amber-600">
                            おすすめ方向性
                          </div>
                          <div className="mt-1 font-bold leading-6 text-amber-900">
                            {order.nail_theme || "未登録"}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-slate-50 p-4">
                          <div className="text-xs text-slate-500">
                            デザイン希望
                          </div>
                          <div className="mt-1 leading-6">
                            {order.design_request?.trim()
                              ? order.design_request
                              : "未入力"}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-slate-50 p-4">
                          <div className="text-xs text-slate-500">
                            サイズ状態
                          </div>
                          <div className="mt-1 font-bold">
                            {order.size_status || "未設定"}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-slate-50 p-4">
                          <div className="text-xs text-slate-500">
                            配送・納期希望
                          </div>
                          <div className="mt-1 leading-6">
                            {order.delivery_request?.trim()
                              ? order.delivery_request
                              : "未入力"}
                          </div>
                        </div>

                        <div className="text-xs text-slate-400">
                          注文日時：{formatDateTime(order.created_at)}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
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
</div>
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