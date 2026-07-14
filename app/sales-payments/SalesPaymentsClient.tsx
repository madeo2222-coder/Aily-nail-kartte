"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type VisitRow = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  menu_name: string | null;
  staff_name: string | null;
  memo: string | null;
};

function buildVisitRegistrationUrl(visit: VisitRow) {
  const params = new URLSearchParams();

  if (visit.customer_id) {
    params.set("customer_id", visit.customer_id);
  }

  if (visit.visit_date) {
    params.set("visit_date", visit.visit_date.split("T")[0]);
  }

  if (visit.menu_name) {
    params.set("menu_name", visit.menu_name);
  }

  if (visit.staff_name) {
    params.set("staff_name", visit.staff_name);
  }

  if (visit.memo) {
    params.set("memo", visit.memo);
  }

  const query = params.toString();

  return query ? `/visits/new?${query}` : "/visits/new";
}

export default function SalesPaymentsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void moveToCurrentCheckout();
  }, [searchParams]);

  async function moveToCurrentCheckout() {
    setLoading(true);
    setErrorMessage("");

    const visitId = searchParams.get("visit_id");

    if (!visitId) {
      router.replace("/visits/new");
      return;
    }

    const { data, error } = await supabase
      .from("visits")
      .select(
        "id, customer_id, visit_date, menu_name, staff_name, memo"
      )
      .eq("id", visitId)
      .maybeSingle();

    if (error) {
      console.error("来店情報取得エラー:", error);
      setErrorMessage(
        "来店情報を取得できませんでした。来店・会計登録画面から登録してください。"
      );
      setLoading(false);
      return;
    }

    if (!data) {
      setErrorMessage(
        "指定された来店情報が見つかりません。来店・会計登録画面から登録してください。"
      );
      setLoading(false);
      return;
    }

    router.replace(buildVisitRegistrationUrl(data as VisitRow));
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-xl space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <p className="text-xs font-bold tracking-[0.25em] text-white/80">
            NAILY AIDOL
          </p>

          <h1 className="mt-2 text-2xl font-bold">会計登録</h1>

          <p className="mt-2 text-sm leading-6 text-white/90">
            会計登録は、現在の来店登録画面へ統合されています。
          </p>
        </section>

        {loading ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
            <div className="text-sm font-bold text-slate-900">
              来店・会計登録画面へ移動しています
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              そのままお待ちください。
            </p>
          </section>
        ) : errorMessage ? (
          <section className="rounded-[28px] border border-red-200 bg-red-50 p-5 shadow-sm">
            <div className="text-sm font-bold text-red-700">
              会計画面を開けませんでした
            </div>

            <p className="mt-2 text-sm leading-6 text-red-600">
              {errorMessage}
            </p>

            <Link
              href="/visits/new"
              className="mt-5 flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-4 text-sm font-bold text-white"
            >
              来店・会計登録へ
            </Link>
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/sales"
            className="rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm"
          >
            <div className="text-sm font-bold text-slate-900">
              売上一覧
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              登録済みの売上と支払い内訳を確認します。
            </p>
          </Link>

          <Link
            href="/visits"
            className="rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm"
          >
            <div className="text-sm font-bold text-slate-900">
              来店一覧
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              来店履歴や会計内容を確認・編集します。
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}