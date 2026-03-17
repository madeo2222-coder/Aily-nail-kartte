"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  salon_id: string | null;
  name: string | null;
  phone: string | null;
  line: string | null;
  memo: string | null;
  created_at: string | null;
};

type Visit = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  menu: string | null;
  color: string | null;
  memo: string | null;
  price: number | string | null;
  created_at: string | null;
};

type CustomerAnalyticsRow = {
  id: string;
  name: string;
  phone: string;
  line: string;
  visitCount: number;
  ltv: number;
  averageUnitPrice: number;
  lastVisitAt: string | null;
  firstVisitAt: string | null;
  avgVisitIntervalDays: number | null;
  daysSinceLastVisit: number | null;
  predictedNextVisitAt: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatCurrency(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function diffDays(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

export default function AnalyticsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setLoading(true);
      setErrorMessage("");

      const [customersRes, visitsRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, salon_id, name, phone, line, memo, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("visits")
          .select("id, salon_id, customer_id, menu, color, memo, price, created_at")
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) return;

      if (customersRes.error) {
        setErrorMessage(`顧客データの取得に失敗しました: ${customersRes.error.message}`);
        setCustomers([]);
        setVisits([]);
        setLoading(false);
        return;
      }

      if (visitsRes.error) {
        setErrorMessage(`来店データの取得に失敗しました: ${visitsRes.error.message}`);
        setCustomers(customersRes.data ?? []);
        setVisits([]);
        setLoading(false);
        return;
      }

      setCustomers(customersRes.data ?? []);
      setVisits(visitsRes.data ?? []);
      setLoading(false);
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  const customerAnalyticsRows = useMemo<CustomerAnalyticsRow[]>(() => {
    const visitsByCustomer = new Map<string, Visit[]>();
    const today = startOfToday();

    for (const visit of visits) {
      if (!visit.customer_id) continue;
      const current = visitsByCustomer.get(visit.customer_id) ?? [];
      current.push(visit);
      visitsByCustomer.set(visit.customer_id, current);
    }

    return customers.map((customer) => {
      const customerVisits = (visitsByCustomer.get(customer.id) ?? [])
        .filter((visit) => !!visit.created_at)
        .sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return aTime - bTime;
        });

      const visitCount = customerVisits.length;
      const ltv = customerVisits.reduce((sum, visit) => sum + toNumber(visit.price), 0);
      const averageUnitPrice = visitCount > 0 ? Math.round(ltv / visitCount) : 0;

      const firstVisitAt = customerVisits[0]?.created_at ?? null;
      const lastVisitAt = customerVisits[visitCount - 1]?.created_at ?? null;

      let avgVisitIntervalDays: number | null = null;
      if (visitCount >= 2) {
        let totalIntervalDays = 0;

        for (let i = 1; i < customerVisits.length; i += 1) {
          const prev = customerVisits[i - 1]?.created_at
            ? new Date(customerVisits[i - 1].created_at as string)
            : null;
          const current = customerVisits[i]?.created_at
            ? new Date(customerVisits[i].created_at as string)
            : null;

          if (!prev || !current) continue;

          const interval = diffDays(prev, current);
          if (interval >= 0) totalIntervalDays += interval;
        }

        avgVisitIntervalDays = Math.round(totalIntervalDays / (visitCount - 1));
      }

      let daysSinceLastVisit: number | null = null;
      if (lastVisitAt) {
        const lastVisitDate = new Date(lastVisitAt);
        if (!Number.isNaN(lastVisitDate.getTime())) {
          daysSinceLastVisit = diffDays(lastVisitDate, today);
        }
      }

      let predictedNextVisitAt: string | null = null;
      if (lastVisitAt && avgVisitIntervalDays !== null) {
        const lastVisitDate = new Date(lastVisitAt);
        if (!Number.isNaN(lastVisitDate.getTime())) {
          predictedNextVisitAt = addDays(lastVisitDate, avgVisitIntervalDays).toISOString();
        }
      }

      return {
        id: customer.id,
        name: customer.name?.trim() || "名前未登録",
        phone: customer.phone?.trim() || "-",
        line: customer.line?.trim() || "-",
        visitCount,
        ltv,
        averageUnitPrice,
        firstVisitAt,
        lastVisitAt,
        avgVisitIntervalDays,
        daysSinceLastVisit,
        predictedNextVisitAt,
      };
    });
  }, [customers, visits]);

  const summary = useMemo(() => {
    const totalCustomers = customerAnalyticsRows.length;
    const repeatCustomers = customerAnalyticsRows.filter((row) => row.visitCount >= 2).length;
    const vipCustomers = customerAnalyticsRows.filter((row) => row.ltv >= 50000).length;
    const followNeededCustomers = customerAnalyticsRows.filter(
      (row) => row.daysSinceLastVisit !== null && row.daysSinceLastVisit >= 60
    ).length;

    const repeatRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

    return {
      totalCustomers,
      repeatCustomers,
      vipCustomers,
      followNeededCustomers,
      repeatRate,
    };
  }, [customerAnalyticsRows]);

  const topLtvCustomers = useMemo(() => {
    return [...customerAnalyticsRows]
      .sort((a, b) => {
        if (b.ltv !== a.ltv) return b.ltv - a.ltv;
        if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;

        const aTime = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
        const bTime = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 10);
  }, [customerAnalyticsRows]);

  const topVisitCustomers = useMemo(() => {
    return [...customerAnalyticsRows]
      .sort((a, b) => {
        if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
        if (b.ltv !== a.ltv) return b.ltv - a.ltv;

        const aTime = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
        const bTime = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 10);
  }, [customerAnalyticsRows]);

  const riskCustomers = useMemo(() => {
    return [...customerAnalyticsRows]
      .filter((row) => row.daysSinceLastVisit !== null && row.daysSinceLastVisit >= 60)
      .sort((a, b) => {
        const aDays = a.daysSinceLastVisit ?? 0;
        const bDays = b.daysSinceLastVisit ?? 0;
        return bDays - aDays;
      })
      .slice(0, 10);
  }, [customerAnalyticsRows]);

  const predictedCustomers = useMemo(() => {
    return [...customerAnalyticsRows]
      .filter((row) => row.predictedNextVisitAt)
      .sort((a, b) => {
        const aTime = a.predictedNextVisitAt ? new Date(a.predictedNextVisitAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.predictedNextVisitAt ? new Date(b.predictedNextVisitAt).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, 10);
  }, [customerAnalyticsRows]);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-pink-600">Naily AiDOL</p>
            <h1 className="mt-1 text-2xl font-bold text-neutral-900">顧客分析</h1>
            <p className="mt-2 text-sm text-neutral-600">
              LTV・再来店・失客リスク・次回来店予測をまとめて確認できます。
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/customers"
              className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
            >
              顧客一覧へ
            </Link>
            <Link
              href="/lost-customers"
              className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              失客分析へ
            </Link>
          </div>
        </div>

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
            <p className="text-xs font-medium text-neutral-500">顧客数</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {loading ? "-" : summary.totalCustomers.toLocaleString("ja-JP")}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
            <p className="text-xs font-medium text-neutral-500">再来店顧客</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {loading ? "-" : summary.repeatCustomers.toLocaleString("ja-JP")}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              再来店率 {loading ? "-" : `${summary.repeatRate}%`}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
            <p className="text-xs font-medium text-neutral-500">VIP顧客</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {loading ? "-" : summary.vipCustomers.toLocaleString("ja-JP")}
            </p>
            <p className="mt-1 text-xs text-neutral-500">LTV 50,000円以上</p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
            <p className="text-xs font-medium text-neutral-500">要フォロー</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {loading ? "-" : summary.followNeededCustomers.toLocaleString("ja-JP")}
            </p>
            <p className="mt-1 text-xs text-neutral-500">60日以上未来店</p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
            <p className="text-xs font-medium text-neutral-500">分析対象来店</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {loading ? "-" : visits.length.toLocaleString("ja-JP")}
            </p>
          </div>
        </section>

        {errorMessage ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200">
            <div className="border-b border-neutral-200 px-4 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-neutral-900">LTVランキング</h2>
              <p className="mt-1 text-sm text-neutral-500">
                累計売上の高い顧客を把握してVIP対応に使えます。
              </p>
            </div>

            <div className="divide-y divide-neutral-200">
              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-500">データを読み込み中です...</div>
              ) : topLtvCustomers.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-500">データがありません。</div>
              ) : (
                topLtvCustomers.map((row, index) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-neutral-900">
                        {index + 1}位 {row.name}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        来店 {row.visitCount}回 / 平均単価 {formatCurrency(row.averageUnitPrice)} / 最終来店{" "}
                        {formatDate(row.lastVisitAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-neutral-900">{formatCurrency(row.ltv)}</p>
                      <Link href={`/customers/${row.id}`} className="mt-1 inline-block text-xs font-semibold text-pink-600">
                        顧客詳細
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200">
            <div className="border-b border-neutral-200 px-4 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-neutral-900">来店回数ランキング</h2>
              <p className="mt-1 text-sm text-neutral-500">
                再来店している優良顧客を把握できます。
              </p>
            </div>

            <div className="divide-y divide-neutral-200">
              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-500">データを読み込み中です...</div>
              ) : topVisitCustomers.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-500">データがありません。</div>
              ) : (
                topVisitCustomers.map((row, index) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-neutral-900">
                        {index + 1}位 {row.name}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        LTV {formatCurrency(row.ltv)} / 平均単価 {formatCurrency(row.averageUnitPrice)} / 最終来店{" "}
                        {formatDate(row.lastVisitAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-neutral-900">{row.visitCount}回</p>
                      <Link href={`/customers/${row.id}`} className="mt-1 inline-block text-xs font-semibold text-pink-600">
                        顧客詳細
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200">
            <div className="border-b border-neutral-200 px-4 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-neutral-900">失客リスク上位</h2>
              <p className="mt-1 text-sm text-neutral-500">
                長く来店していない顧客を優先フォローできます。
              </p>
            </div>

            <div className="divide-y divide-neutral-200">
              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-500">データを読み込み中です...</div>
              ) : riskCustomers.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-500">60日以上未来店の顧客はいません。</div>
              ) : (
                riskCustomers.map((row, index) => {
                  const reviewHref = `/reviews?customer_id=${encodeURIComponent(row.id)}&customer_name=${encodeURIComponent(row.name)}`;
                  return (
                    <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-neutral-900">
                          {index + 1}位 {row.name}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          最終来店 {formatDate(row.lastVisitAt)} / 来店 {row.visitCount}回 / LTV{" "}
                          {formatCurrency(row.ltv)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-red-600">
                          {row.daysSinceLastVisit ?? "-"}日経過
                        </p>
                        <div className="mt-1 flex items-center justify-end gap-2">
                          <Link href={`/customers/${row.id}`} className="text-xs font-semibold text-pink-600">
                            顧客詳細
                          </Link>
                          <Link href={reviewHref} className="text-xs font-semibold text-neutral-600">
                            口コミ導線
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200">
            <div className="border-b border-neutral-200 px-4 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-neutral-900">次回来店予測</h2>
              <p className="mt-1 text-sm text-neutral-500">
                来店周期から次の声かけタイミングを見つけます。
              </p>
            </div>

            <div className="divide-y divide-neutral-200">
              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-500">データを読み込み中です...</div>
              ) : predictedCustomers.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-500">2回来店以上の顧客がまだいません。</div>
              ) : (
                predictedCustomers.map((row, index) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-neutral-900">
                        {index + 1}位 {row.name}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        平均周期 {row.avgVisitIntervalDays ?? "-"}日 / 最終来店 {formatDate(row.lastVisitAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-neutral-900">
                        {formatDate(row.predictedNextVisitAt)}
                      </p>
                      <Link href={`/customers/${row.id}`} className="mt-1 inline-block text-xs font-semibold text-pink-600">
                        顧客詳細
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}