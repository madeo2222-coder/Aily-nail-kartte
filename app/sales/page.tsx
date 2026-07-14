"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRelation =
  | {
      name: string | null;
    }
  | {
      name: string | null;
    }[]
  | null;

type Visit = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  menu_name: string | null;
  staff_name: string | null;
  price: number | null;
  payment_method: string | null;
  customers: CustomerRelation;
};

type VisitPayment = {
  id: string;
  visit_id: string;
  payment_method: string;
  amount: number | null;
  sort_order: number | null;
};

function getCustomerName(customers: CustomerRelation) {
  if (!customers) return "顧客名なし";

  if (Array.isArray(customers)) {
    return customers[0]?.name || "顧客名なし";
  }

  return customers.name || "顧客名なし";
}

function formatDate(value: string | null) {
  if (!value) return "未設定";

  const normalized = value.trim().replace(/\//g, "-");
  const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (matched) {
    return `${matched[1]}/${Number(matched[2])}/${Number(matched[3])}`;
  }

  return value;
}

function formatPrice(value: number | null) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "¥0";
  }

  const absoluteAmount = Math.abs(Math.round(amount));
  const prefix = amount < 0 ? "-¥" : "¥";

  return `${prefix}${absoluteAmount.toLocaleString("ja-JP")}`;
}

function formatPaymentSummary(
  visit: Visit,
  paymentMap: Record<string, VisitPayment[]>
) {
  const rows = paymentMap[visit.id] ?? [];

  if (rows.length === 0) {
    return visit.payment_method || "未設定";
  }

  return rows
    .map((row) => `${row.payment_method} ${formatPrice(row.amount)}`)
    .join(" / ");
}

function getMonthPrefix(value: string | null) {
  if (!value) return null;

  const normalized = value.trim().replace(/\//g, "-");

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized.slice(0, 7);
  }

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function buildCurrentMonth() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(value: string) {
  const [year, month] = value.split("-");

  if (!year || !month) {
    return value;
  }

  return `${year}年${Number(month)}月`;
}

function buildMonthOptions(visits: Visit[]) {
  const values = new Set<string>();

  values.add(buildCurrentMonth());

  visits.forEach((visit) => {
    const month = getMonthPrefix(visit.visit_date);

    if (month) {
      values.add(month);
    }
  });

  return Array.from(values)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({
      value,
      label: getMonthLabel(value),
    }));
}

export default function SalesPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [paymentMap, setPaymentMap] = useState<
    Record<string, VisitPayment[]>
  >({});
  const [selectedMonth, setSelectedMonth] = useState(buildCurrentMonth());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void fetchSales();
  }, []);

  async function fetchSales() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("visits")
      .select(
        `
          id,
          customer_id,
          visit_date,
          menu_name,
          staff_name,
          price,
          payment_method,
          customers (
            name
          )
        `
      )
      .order("visit_date", { ascending: false });

    if (error) {
      console.error("売上一覧取得エラー:", error);
      setVisits([]);
      setPaymentMap({});
      setErrorMessage("売上一覧の取得に失敗しました");
      setLoading(false);
      return;
    }

    const nextVisits = (data as Visit[]) || [];

    setVisits(nextVisits);

    const visitIds = nextVisits
      .map((visit) => visit.id)
      .filter((id): id is string => Boolean(id));

    if (visitIds.length === 0) {
      setPaymentMap({});
      setLoading(false);
      return;
    }

    const { data: paymentData, error: paymentError } = await supabase
      .from("visit_payments")
      .select("id, visit_id, payment_method, amount, sort_order")
      .in("visit_id", visitIds)
      .order("sort_order", { ascending: true });

    if (paymentError) {
      console.error("支払い内訳取得エラー:", paymentError);
      setPaymentMap({});
      setErrorMessage(
        "売上は取得できましたが、支払い内訳の取得に失敗しました"
      );
      setLoading(false);
      return;
    }

    const nextPaymentMap: Record<string, VisitPayment[]> = {};

    ((paymentData || []) as VisitPayment[]).forEach((payment) => {
      if (!nextPaymentMap[payment.visit_id]) {
        nextPaymentMap[payment.visit_id] = [];
      }

      nextPaymentMap[payment.visit_id].push(payment);
    });

    setPaymentMap(nextPaymentMap);
    setLoading(false);
  }

  const monthOptions = useMemo(() => {
    return buildMonthOptions(visits);
  }, [visits]);

  const filteredVisits = useMemo(() => {
    return visits.filter(
      (visit) => getMonthPrefix(visit.visit_date) === selectedMonth
    );
  }, [visits, selectedMonth]);

  const totalSales = useMemo(() => {
    return filteredVisits.reduce(
      (sum, visit) => sum + Number(visit.price ?? 0),
      0
    );
  }, [filteredVisits]);

  const paymentTotals = useMemo(() => {
    const totals: Record<string, number> = {};

    filteredVisits.forEach((visit) => {
      const paymentRows = paymentMap[visit.id] ?? [];

      if (paymentRows.length === 0) {
        const method = visit.payment_method || "未設定";
        totals[method] =
          (totals[method] || 0) + Number(visit.price ?? 0);
        return;
      }

      paymentRows.forEach((payment) => {
        const method = payment.payment_method || "未設定";
        totals[method] =
          (totals[method] || 0) + Number(payment.amount ?? 0);
      });
    });

    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [filteredVisits, paymentMap]);

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-[920px] space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>

              <h1 className="mt-2 text-2xl font-bold">売上一覧</h1>

              <p className="mt-2 text-sm leading-6 text-white/90">
                来店履歴と支払い内訳をもとに、売上を確認できます。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/sales-dashboard"
                className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
              >
                売上ダッシュボード
              </Link>

              <Link
                href="/visits/new"
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
              >
                来店・会計登録
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-bold text-slate-900">
            対象月
          </label>

          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="w-full max-w-xs rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </section>

        {loading ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-5 text-sm text-slate-500 shadow-sm">
            読み込み中...
          </section>
        ) : errorMessage ? (
          <section className="rounded-[28px] border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700 shadow-sm">
            {errorMessage}
          </section>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">対象月売上</div>

                <div className="mt-2 text-3xl font-bold text-slate-900">
                  {formatPrice(totalSales)}
                </div>
              </div>

              <div className="rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">施術件数</div>

                <div className="mt-2 text-3xl font-bold text-slate-900">
                  {filteredVisits.length.toLocaleString("ja-JP")}件
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">
                支払い方法別売上
              </h2>

              {paymentTotals.length === 0 ? (
                <div className="mt-4 text-sm text-slate-500">
                  支払いデータがありません
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {paymentTotals.map(([method, amount]) => (
                    <div
                      key={method}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-rose-50/50 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-slate-700">
                        {method}
                      </span>

                      <span className="font-bold text-slate-900">
                        {formatPrice(amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {filteredVisits.length === 0 ? (
              <section className="rounded-[28px] border border-rose-100 bg-white p-5 text-sm text-slate-500 shadow-sm">
                対象月の売上データはありません
              </section>
            ) : (
              <section className="space-y-3">
                {filteredVisits.map((visit) => (
                  <article
                    key={visit.id}
                    className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-bold text-slate-900">
                          {getCustomerName(visit.customers)}
                        </div>

                        <div className="mt-1 text-sm text-slate-500">
                          来店日：{formatDate(visit.visit_date)}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-lg font-bold text-slate-900">
                          {formatPrice(visit.price)}
                        </div>

                        <Link
                          href={`/visits/${visit.id}/edit`}
                          className="mt-2 inline-flex rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-600"
                        >
                          編集
                        </Link>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-700">
                      <div>
                        <span className="font-medium">メニュー：</span>
                        {visit.menu_name || "未設定"}
                      </div>

                      <div>
                        <span className="font-medium">担当：</span>
                        {visit.staff_name || "未設定"}
                      </div>

                      <div>
                        <span className="font-medium">支払い：</span>
                        {formatPaymentSummary(visit, paymentMap)}
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </>
        )}

        <Link
          href="/visits"
          className="block rounded-2xl border border-rose-200 bg-white px-4 py-3 text-center text-sm font-bold text-rose-600"
        >
          来店ページへ
        </Link>
      </div>
    </main>
  );
}