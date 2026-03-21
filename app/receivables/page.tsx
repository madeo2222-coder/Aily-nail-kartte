"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type VisitRow = {
  id: string;
  customer_id?: string | null;
  visit_date?: string | null;
  created_at?: string | null;
  menu_name?: string | null;
  memo?: string | null;
  amount?: number | string | null;
  price?: number | string | null;
  total_amount?: number | string | null;
  menu_price?: number | string | null;
  sales_amount?: number | string | null;
  payment_status?: string | null;
  paid_amount?: number | string | null;
  unpaid_amount?: number | string | null;
  payment_method?: string | null;
  customers?: {
    name?: string | null;
    phone?: string | null;
  } | null;
  [key: string]: any;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function formatYen(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

function toDateString(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getVisitAmount(v: VisitRow): number | null {
  const candidates = [
    v.amount,
    v.price,
    v.total_amount,
    v.menu_price,
    v.sales_amount,
  ];

  for (const candidate of candidates) {
    const num = toNumber(candidate);
    if (num !== null) return num;
  }

  return null;
}

function getPaidAmount(v: VisitRow, resolvedAmount: number | null): number {
  const paid = toNumber(v.paid_amount);
  if (paid !== null) return paid;

  if (v.payment_status === "paid") return resolvedAmount ?? 0;
  if (v.payment_status === "unpaid") return 0;

  return resolvedAmount ?? 0;
}

function getUnpaidAmount(v: VisitRow, resolvedAmount: number | null): number {
  const unpaid = toNumber(v.unpaid_amount);
  if (unpaid !== null) return unpaid;

  if (v.payment_status === "unpaid") return resolvedAmount ?? 0;
  if (v.payment_status === "paid") return 0;

  return 0;
}

function paymentStatusLabel(status?: string | null) {
  if (status === "unpaid") return "未収";
  if (status === "partial") return "一部入金";
  return "支払い済み";
}

function paymentMethodLabel(method?: string | null) {
  if (method === "cash") return "現金";
  if (method === "card") return "カード";
  if (method === "qr") return "QR決済";
  if (method === "bank") return "振込";
  if (method === "other") return "その他";
  return "未入力";
}

export default function ReceivablesPage() {
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReceivables();
  }, []);

  async function fetchReceivables() {
    setLoading(true);

    const { data, error } = await supabase
      .from("visits")
      .select(`
        *,
        customers (
          name,
          phone
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("receivables fetch error:", error);
      setVisits([]);
      setLoading(false);
      return;
    }

    setVisits((data as VisitRow[]) || []);
    setLoading(false);
  }

  const receivables = useMemo(() => {
    return visits
      .map((visit) => {
        const resolvedAmount = getVisitAmount(visit);
        const resolvedPaidAmount = getPaidAmount(visit, resolvedAmount);
        const resolvedUnpaidAmount = getUnpaidAmount(visit, resolvedAmount);
        const effectiveDate = visit.visit_date || visit.created_at || null;
        const effectiveDateStr = toDateString(effectiveDate);

        return {
          ...visit,
          resolvedAmount,
          resolvedPaidAmount,
          resolvedUnpaidAmount,
          effectiveDate,
          effectiveDateStr,
        };
      })
      .filter((visit) => visit.resolvedUnpaidAmount > 0)
      .sort((a, b) => {
        const aTime = a.effectiveDate ? new Date(a.effectiveDate).getTime() : 0;
        const bTime = b.effectiveDate ? new Date(b.effectiveDate).getTime() : 0;
        return bTime - aTime;
      });
  }, [visits]);

  const totalReceivable = useMemo(() => {
    return receivables.reduce((sum, row) => sum + row.resolvedUnpaidAmount, 0);
  }, [receivables]);

  return (
    <div className="p-4 pb-24">
      <div className="mb-4">
        <Link href="/dashboard" className="text-sm underline">
          ← ダッシュボードへ戻る
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">未収一覧</h1>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500 mb-1">未収件数</p>
          <p className="text-2xl font-bold">{receivables.length}件</p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-gray-500 mb-1">未収総額</p>
          <p className="text-2xl font-bold">{formatYen(totalReceivable)}</p>
        </div>
      </div>

      {loading ? (
        <p>読み込み中...</p>
      ) : receivables.length === 0 ? (
        <div className="rounded-xl border bg-white p-5">
          <p className="text-lg font-semibold mb-2">未収はありません。</p>
          <p className="text-gray-600">
            現時点では回収が必要なデータは登録されていません。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {receivables.map((visit) => (
            <div key={visit.id} className="rounded-xl border-2 border-black bg-white p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-xl font-bold">
                  顧客名：{visit.customers?.name || "未登録"}
                </p>
                <span className="text-xs border border-red-400 text-red-600 rounded-full px-2 py-1 font-bold">
                  未収あり
                </span>
              </div>

              <p className="mb-1">日付：{visit.effectiveDateStr || "未入力"}</p>
              <p className="mb-1">メニュー：{visit.menu_name || "未入力"}</p>
              <p className="mb-1">
                売上金額：
                {visit.resolvedAmount !== null
                  ? formatYen(visit.resolvedAmount)
                  : "未入力"}
              </p>
              <p className="mb-1">入金額：{formatYen(visit.resolvedPaidAmount)}</p>
              <p className="mb-1 font-bold">未収額：{formatYen(visit.resolvedUnpaidAmount)}</p>
              <p className="mb-1">支払い状況：{paymentStatusLabel(visit.payment_status)}</p>
              <p className="mb-1">支払い方法：{paymentMethodLabel(visit.payment_method)}</p>
              <p className="break-words mb-4">メモ：{visit.memo || "-"}</p>

              <div className="grid grid-cols-2 gap-3">
                <Link
                  href={`/visits/${visit.id}?from=receivables`}
                  className="rounded-xl border-2 border-black px-4 py-3 text-center text-lg font-bold"
                >
                  入金更新
                </Link>

                <Link
                  href="/visits"
                  className="rounded-xl border px-4 py-3 text-center text-lg font-bold"
                >
                  来店一覧へ
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-6">
        <Link
          href="/visits/new"
          className="bg-black text-white text-center rounded-xl px-4 py-3 font-bold"
        >
          ＋ 来店登録
        </Link>
        <Link
          href="/visits"
          className="border-2 border-black text-center rounded-xl px-4 py-3 font-bold"
        >
          来店一覧へ
        </Link>
      </div>
    </div>
  );
}