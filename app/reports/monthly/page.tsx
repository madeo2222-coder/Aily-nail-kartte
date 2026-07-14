"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type VisitReportRow = {
  id: string;
  visit_date: string | null;
  price: number;
  customer_id: string | null;
  menu_name: string | null;
  staff_name: string | null;
};

type VisitPaymentReportRow = {
  id: string;
  visit_id: string;
  amount: number;
  payment_method: string | null;
  sort_order: number | null;
};

type PaymentDetailRow = {
  id: string;
  visit_id: string;
  visit_date: string | null;
  amount: number;
  payment_method: string | null;
  menu_name: string | null;
  staff_name: string | null;
};

type MonthlyDayRow = {
  day: string;
  sales: number;
  count: number;
};

type PaymentMethodSummary = {
  method: string;
  amount: number;
  count: number;
};

function formatYen(value?: number | string | null) {
  const numberValue = Number(value ?? 0);

  if (!Number.isFinite(numberValue)) {
    return "¥0";
  }

  const rounded = Math.round(numberValue);
  const absoluteAmount = Math.abs(rounded).toLocaleString("ja-JP");

  return rounded < 0 ? `-¥${absoluteAmount}` : `¥${absoluteAmount}`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const normalized = value.trim().replace(/\//g, "-");
  const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (matched) {
    return `${matched[1]}/${matched[2]}/${matched[3]}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}/${String(date.getDate()).padStart(2, "0")}`;
}

function getMonthInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function getMonthRange(monthText: string) {
  const [yearText, monthTextValue] = monthText.split("-");
  const year = Number(yearText);
  const month = Number(monthTextValue);

  const nextMonthDate = new Date(year, month, 1);

  const startText = `${year}-${String(month).padStart(2, "0")}-01`;
  const endText = `${nextMonthDate.getFullYear()}-${String(
    nextMonthDate.getMonth() + 1
  ).padStart(2, "0")}-01`;

  return {
    startText,
    endText,
    year,
    month,
  };
}

function normalizeVisitRows(rows: unknown[]): VisitReportRow[] {
  return (rows || []).map((row) => {
    const item = row as Record<string, unknown>;

    return {
      id: String(item.id ?? ""),
      visit_date:
        typeof item.visit_date === "string" ? item.visit_date : null,
      price: Number(item.price ?? 0),
      customer_id:
        typeof item.customer_id === "string" ? item.customer_id : null,
      menu_name:
        typeof item.menu_name === "string" ? item.menu_name : null,
      staff_name:
        typeof item.staff_name === "string" ? item.staff_name : null,
    };
  });
}

function normalizePaymentRows(
  rows: unknown[]
): VisitPaymentReportRow[] {
  return (rows || []).map((row) => {
    const item = row as Record<string, unknown>;

    return {
      id: String(item.id ?? ""),
      visit_id: String(item.visit_id ?? ""),
      amount: Number(item.amount ?? 0),
      payment_method:
        typeof item.payment_method === "string"
          ? item.payment_method
          : null,
      sort_order:
        typeof item.sort_order === "number"
          ? item.sort_order
          : item.sort_order !== null &&
            item.sort_order !== undefined &&
            Number.isFinite(Number(item.sort_order))
          ? Number(item.sort_order)
          : null,
    };
  });
}

function getPaymentMethodLabel(value?: string | null) {
  if (!value) {
    return "未設定";
  }

  if (value === "cash") {
    return "現金";
  }

  if (value === "card") {
    return "クレジットカード";
  }

  if (value === "other") {
    return "その他";
  }

  return value;
}

function getPaymentMethodGroup(value?: string | null) {
  const label = getPaymentMethodLabel(value);

  if (label === "現金") {
    return "現金";
  }

  if (label === "PayPay" || label === "QR決済") {
    return "PayPay・QR決済";
  }

  if (
    label === "クレジットカード" ||
    label === "クレジット" ||
    label === "Visa" ||
    label === "Mastercard" ||
    label === "JCB" ||
    label === "AMEX" ||
    label === "Diners" ||
    label === "Discover" ||
    label === "UnionPay（銀聯）"
  ) {
    return "カード";
  }

  if (
    label === "交通系IC" ||
    label === "iD" ||
    label === "QUICPay" ||
    label === "楽天Edy" ||
    label === "WAON" ||
    label === "nanaco"
  ) {
    return "電子マネー";
  }

  if (
    label === "割引" ||
    label === "ホットペッパーポイント"
  ) {
    return "割引・ポイント";
  }

  return "その他";
}

export default function MonthlyReportPage() {
  const [targetMonth, setTargetMonth] = useState(
    getMonthInputValue()
  );
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [visits, setVisits] = useState<VisitReportRow[]>([]);
  const [visitPayments, setVisitPayments] = useState<
    VisitPaymentReportRow[]
  >([]);

  useEffect(() => {
    void fetchMonthlyData();
  }, [targetMonth]);

  async function fetchMonthlyData() {
    setLoading(true);
    setPageError("");
    setVisits([]);
    setVisitPayments([]);

    const { startText, endText } = getMonthRange(targetMonth);

    const { data: visitsData, error: visitsError } = await supabase
      .from("visits")
      .select(
        "id, visit_date, price, customer_id, menu_name, staff_name"
      )
      .gte("visit_date", startText)
      .lt("visit_date", endText)
      .order("visit_date", { ascending: true });

    if (visitsError) {
      console.error("月次来店データ取得エラー:", visitsError);
      setPageError(
        `来店データの取得に失敗しました: ${visitsError.message}`
      );
      setLoading(false);
      return;
    }

    const normalizedVisits = normalizeVisitRows(visitsData || []);
    setVisits(normalizedVisits);

    const visitIds = normalizedVisits
      .map((visit) => visit.id)
      .filter(Boolean);

    if (visitIds.length === 0) {
      setVisitPayments([]);
      setLoading(false);
      return;
    }

    const { data: paymentsData, error: paymentsError } =
      await supabase
        .from("visit_payments")
        .select(
          "id, visit_id, amount, payment_method, sort_order"
        )
        .in("visit_id", visitIds)
        .order("sort_order", { ascending: true });

    if (paymentsError) {
      console.error(
        "月次支払い明細取得エラー:",
        paymentsError
      );
      setPageError(
        `支払い明細の取得に失敗しました: ${paymentsError.message}`
      );
      setVisitPayments([]);
      setLoading(false);
      return;
    }

    setVisitPayments(normalizePaymentRows(paymentsData || []));
    setLoading(false);
  }

  const visitMap = useMemo(() => {
    const map = new Map<string, VisitReportRow>();

    visits.forEach((visit) => {
      map.set(visit.id, visit);
    });

    return map;
  }, [visits]);

  const paymentDetails = useMemo<PaymentDetailRow[]>(() => {
    return visitPayments
      .map((payment) => {
        const visit = visitMap.get(payment.visit_id);

        return {
          id: payment.id,
          visit_id: payment.visit_id,
          visit_date: visit?.visit_date || null,
          amount: payment.amount,
          payment_method: payment.payment_method,
          menu_name: visit?.menu_name || null,
          staff_name: visit?.staff_name || null,
        };
      })
      .sort((a, b) => {
        const dateCompare = (a.visit_date || "").localeCompare(
          b.visit_date || ""
        );

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return a.id.localeCompare(b.id);
      });
  }, [visitPayments, visitMap]);

  const summary = useMemo(() => {
    const monthlySales = visits.reduce(
      (sum, visit) => sum + Number(visit.price || 0),
      0
    );

    const visitCount = visits.length;

    const averageUnitPrice =
      visitCount > 0
        ? Math.round(monthlySales / visitCount)
        : 0;

    const paymentTotal = visitPayments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    const cashSales = visitPayments
      .filter(
        (payment) =>
          getPaymentMethodGroup(payment.payment_method) === "現金"
      )
      .reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );

    const qrSales = visitPayments
      .filter(
        (payment) =>
          getPaymentMethodGroup(payment.payment_method) ===
          "PayPay・QR決済"
      )
      .reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );

    const cardSales = visitPayments
      .filter(
        (payment) =>
          getPaymentMethodGroup(payment.payment_method) ===
          "カード"
      )
      .reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );

    const electronicMoneySales = visitPayments
      .filter(
        (payment) =>
          getPaymentMethodGroup(payment.payment_method) ===
          "電子マネー"
      )
      .reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );

    const discountSales = visitPayments
      .filter(
        (payment) =>
          getPaymentMethodGroup(payment.payment_method) ===
          "割引・ポイント"
      )
      .reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );

    const otherSales = visitPayments
      .filter(
        (payment) =>
          getPaymentMethodGroup(payment.payment_method) ===
          "その他"
      )
      .reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );

    return {
      monthlySales,
      visitCount,
      averageUnitPrice,
      paymentTotal,
      cashSales,
      qrSales,
      cardSales,
      electronicMoneySales,
      discountSales,
      otherSales,
    };
  }, [visits, visitPayments]);

  const paymentMethodSummary = useMemo<
    PaymentMethodSummary[]
  >(() => {
    const map = new Map<
      string,
      {
        amount: number;
        count: number;
      }
    >();

    visitPayments.forEach((payment) => {
      const method = getPaymentMethodLabel(
        payment.payment_method
      );

      const current = map.get(method) || {
        amount: 0,
        count: 0,
      };

      map.set(method, {
        amount: current.amount + Number(payment.amount || 0),
        count: current.count + 1,
      });
    });

    return Array.from(map.entries())
      .map(([method, value]) => ({
        method,
        amount: value.amount,
        count: value.count,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [visitPayments]);

  const dailyRows = useMemo<MonthlyDayRow[]>(() => {
    const map = new Map<
      string,
      {
        sales: number;
        count: number;
      }
    >();

    visits.forEach((visit) => {
      const day = visit.visit_date || "";

      if (!day) {
        return;
      }

      const current = map.get(day) || {
        sales: 0,
        count: 0,
      };

      map.set(day, {
        sales: current.sales + Number(visit.price || 0),
        count: current.count + 1,
      });
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({
        day,
        sales: value.sales,
        count: value.count,
      }));
  }, [visits]);

  const monthLabel = useMemo(() => {
    const { year, month } = getMonthRange(targetMonth);

    return `${year}年${month}月`;
  }, [targetMonth]);

  const paymentDifference =
    summary.monthlySales - summary.paymentTotal;

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">
              月次レポート
            </h1>

            <p className="mt-1 text-sm text-neutral-600">
              売上、来店数、客単価、支払い方法別売上を確認できます
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              ダッシュボード
            </Link>

            <Link
              href="/sales"
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              売上一覧
            </Link>

            <Link
              href="/visits/new"
              className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              来店・会計登録
            </Link>
          </div>
        </div>

        <section className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <label
                htmlFor="targetMonth"
                className="mb-2 block text-sm font-medium text-neutral-800"
              >
                対象月
              </label>

              <input
                id="targetMonth"
                type="month"
                value={targetMonth}
                onChange={(event) =>
                  setTargetMonth(event.target.value)
                }
                className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-black"
              />
            </div>

            <div className="text-sm text-neutral-600">
              集計対象：
              <span className="font-semibold text-neutral-900">
                {monthLabel}
              </span>
            </div>
          </div>
        </section>

        {pageError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-16 text-center text-sm text-neutral-500 shadow-sm">
            月次レポートを読み込み中...
          </div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">
                  {monthLabel}売上
                </div>

                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {formatYen(summary.monthlySales)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">
                  来店数
                </div>

                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {summary.visitCount.toLocaleString("ja-JP")}件
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">
                  客単価
                </div>

                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {formatYen(summary.averageUnitPrice)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">
                  支払い明細合計
                </div>

                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {formatYen(summary.paymentTotal)}
                </div>

                <div
                  className={`mt-2 text-sm ${
                    paymentDifference === 0
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }`}
                >
                  売上との差額：{formatYen(paymentDifference)}
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">
                  現金
                </div>

                <div className="mt-2 text-2xl font-bold text-neutral-900">
                  {formatYen(summary.cashSales)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">
                  PayPay・QR決済
                </div>

                <div className="mt-2 text-2xl font-bold text-neutral-900">
                  {formatYen(summary.qrSales)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">
                  カード
                </div>

                <div className="mt-2 text-2xl font-bold text-neutral-900">
                  {formatYen(summary.cardSales)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">
                  電子マネー
                </div>

                <div className="mt-2 text-2xl font-bold text-neutral-900">
                  {formatYen(summary.electronicMoneySales)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">
                  割引・ポイント
                </div>

                <div className="mt-2 text-2xl font-bold text-neutral-900">
                  {formatYen(summary.discountSales)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">
                  その他
                </div>

                <div className="mt-2 text-2xl font-bold text-neutral-900">
                  {formatYen(summary.otherSales)}
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900">
                  支払い方法別売上
                </h2>

                {paymentMethodSummary.length === 0 ? (
                  <div className="mt-4 text-sm text-neutral-500">
                    支払い明細はありません
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {paymentMethodSummary.map((row) => (
                      <div
                        key={row.method}
                        className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-4 py-3"
                      >
                        <div>
                          <div className="text-sm font-medium text-neutral-700">
                            {row.method}
                          </div>

                          <div className="mt-1 text-xs text-neutral-500">
                            {row.count.toLocaleString("ja-JP")}件
                          </div>
                        </div>

                        <span className="text-sm font-semibold text-neutral-900">
                          {formatYen(row.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900">
                  月次サマリー
                </h2>

                <div className="mt-4 space-y-3 text-sm text-neutral-700">
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span>対象月</span>
                    <span className="font-semibold text-neutral-900">
                      {monthLabel}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span>合計売上</span>
                    <span className="font-semibold text-neutral-900">
                      {formatYen(summary.monthlySales)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span>来店数</span>
                    <span className="font-semibold text-neutral-900">
                      {summary.visitCount.toLocaleString("ja-JP")}件
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span>客単価</span>
                    <span className="font-semibold text-neutral-900">
                      {formatYen(summary.averageUnitPrice)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span>支払い明細合計</span>
                    <span className="font-semibold text-neutral-900">
                      {formatYen(summary.paymentTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-neutral-900">
                  日別売上
                </h2>

                <p className="mt-1 text-sm text-neutral-600">
                  来店日ごとの売上と来店件数です
                </p>
              </div>

              {dailyRows.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-neutral-500">
                  この月の売上データはありません
                </div>
              ) : (
                <>
                  <div className="hidden md:block">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600">
                            日付
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600">
                            来店数
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600">
                            売上
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {dailyRows.map((row) => (
                          <tr
                            key={row.day}
                            className="border-b border-neutral-100 last:border-b-0"
                          >
                            <td className="px-4 py-4 text-sm text-neutral-700">
                              {formatDate(row.day)}
                            </td>

                            <td className="px-4 py-4 text-right text-sm text-neutral-700">
                              {row.count.toLocaleString("ja-JP")}件
                            </td>

                            <td className="px-4 py-4 text-right text-sm font-semibold text-neutral-900">
                              {formatYen(row.sales)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 p-4 md:hidden">
                    {dailyRows.map((row) => (
                      <div
                        key={row.day}
                        className="rounded-xl border border-neutral-200 bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-neutral-900">
                            {formatDate(row.day)}
                          </div>

                          <div className="text-sm font-bold text-neutral-900">
                            {formatYen(row.sales)}
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-neutral-500">
                          来店数：
                          {row.count.toLocaleString("ja-JP")}件
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-neutral-900">
                  支払い明細
                </h2>

                <p className="mt-1 text-sm text-neutral-600">
                  来店日・支払い方法ごとの会計明細です
                </p>
              </div>

              {paymentDetails.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-neutral-500">
                  この月の支払い明細はありません
                </div>
              ) : (
                <>
                  <div className="hidden md:block">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600">
                            来店日
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600">
                            支払い方法
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600">
                            メニュー
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600">
                            担当
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600">
                            金額
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {paymentDetails.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-neutral-100 last:border-b-0"
                          >
                            <td className="px-4 py-4 text-sm text-neutral-700">
                              {formatDate(row.visit_date)}
                            </td>

                            <td className="px-4 py-4 text-sm text-neutral-700">
                              {getPaymentMethodLabel(
                                row.payment_method
                              )}
                            </td>

                            <td className="px-4 py-4 text-sm text-neutral-700">
                              {row.menu_name || "未設定"}
                            </td>

                            <td className="px-4 py-4 text-sm text-neutral-700">
                              {row.staff_name || "未設定"}
                            </td>

                            <td className="px-4 py-4 text-right text-sm font-semibold text-neutral-900">
                              {formatYen(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 p-4 md:hidden">
                    {paymentDetails.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-xl border border-neutral-200 bg-white p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-neutral-900">
                              {formatDate(row.visit_date)}
                            </div>

                            <div className="mt-1 text-xs text-neutral-500">
                              {getPaymentMethodLabel(
                                row.payment_method
                              )}
                            </div>

                            <div className="mt-1 text-xs text-neutral-500">
                              {row.menu_name || "メニュー未設定"} /{" "}
                              {row.staff_name || "担当未設定"}
                            </div>
                          </div>

                          <div className="text-sm font-bold text-neutral-900">
                            {formatYen(row.amount)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}