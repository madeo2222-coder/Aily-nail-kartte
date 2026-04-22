"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
  name_kana: string | null;
  allergy: string | null;
};

type Visit = {
  customer_id: string;
  next_visit_date: string | null;
  next_proposal: string | null;
  visit_date: string;
};

function formatDateLabel(value: string | null) {
  if (!value) return "";
  const normalized = value.slice(0, 10);
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return value;
  return `${year}/${Number(month)}/${Number(day)}`;
}

export default function CustomersPageClient() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: customersData } = await supabase
      .from("customers")
      .select("id, name, name_kana, allergy")
      .order("created_at", { ascending: false });

    if (customersData) setCustomers(customersData);

    const { data: visitsData } = await supabase
      .from("visits")
      .select("customer_id, next_visit_date, next_proposal, visit_date")
      .order("visit_date", { ascending: false });

    if (visitsData) setVisits(visitsData);
  }

  function getLatestVisit(customerId: string) {
    return visits.find((v) => v.customer_id === customerId);
  }

  const filteredCustomers = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase();

    if (!trimmed) return customers;

    return customers.filter((customer) => {
      const name = (customer.name || "").toLowerCase();
      const nameKana = (customer.name_kana || "").toLowerCase();

      return name.includes(trimmed) || nameKana.includes(trimmed);
    });
  }, [customers, keyword]);

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-[920px] space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">顧客ページ</h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                お客様情報や次回提案を、見やすくまとめて確認できるページです。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/staff"
                className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
              >
                スタッフページへ
              </Link>
              <Link
                href="/customers/new"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-rose-500 shadow"
              >
                ＋ 顧客を追加
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <div className="text-sm font-bold text-slate-900">顧客検索</div>
            <div className="mt-1 text-xs text-slate-500">
              お名前やフリガナで、見たいお客様をすぐ探せます。
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                名前 / フリガナ
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="名前 / フリガナで検索"
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
              />
            </div>

            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
              表示件数 {filteredCustomers.length}件
            </div>
          </div>
        </section>

        {filteredCustomers.length === 0 ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
            条件に合うお客様はいません
          </section>
        ) : (
          <section className="space-y-3">
            {filteredCustomers.map((customer) => {
              const latest = getLatestVisit(customer.id);

              return (
                <Link
                  key={customer.id}
                  href={`/customers/${customer.id}`}
                  className="block rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm transition hover:bg-rose-50/50"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-bold text-slate-900">
                          {customer.name || "顧客名なし"}
                        </div>

                        {customer.allergy ? (
                          <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                            アレルギーあり
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 text-sm text-slate-500">
                        フリガナ：{customer.name_kana || "－"}
                      </div>

                      <div className="mt-4 grid gap-2 text-sm text-slate-700">
                        {customer.allergy ? (
                          <div className="rounded-2xl bg-rose-50 px-3 py-2 text-rose-700">
                            <span className="font-medium">アレルギー:</span>{" "}
                            {customer.allergy}
                          </div>
                        ) : (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-slate-500">
                            アレルギー登録なし
                          </div>
                        )}

                        {latest?.next_visit_date ? (
                          <div className="rounded-2xl bg-pink-50 px-3 py-2 text-pink-700">
                            <span className="font-medium">次回来店:</span>{" "}
                            {formatDateLabel(latest.next_visit_date)}
                          </div>
                        ) : (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-slate-500">
                            次回来店予定は未登録です
                          </div>
                        )}

                        {latest?.next_proposal ? (
                          <div className="rounded-2xl bg-amber-50 px-3 py-2 text-amber-700">
                            <span className="font-medium">次回提案:</span>{" "}
                            {latest.next_proposal}
                          </div>
                        ) : (
                          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-slate-500">
                            次回提案は未登録です
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <div className="inline-flex rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600">
                        詳細を見る
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}