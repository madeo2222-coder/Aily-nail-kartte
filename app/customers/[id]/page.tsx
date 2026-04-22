"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type Customer = {
  id: string;
  name: string;
  name_kana: string | null;
  phone: string | null;
};

type Visit = {
  id: string;
  customer_id: string;
  visit_date: string | null;
  price: number | null;
  payment_method: string | null;
  memo: string | null;
  next_visit_date: string | null;
  next_proposal: string | null;
};

type VisitPayment = {
  id: string;
  visit_id: string;
  payment_method: string;
  amount: number | null;
  sort_order: number | null;
};

type CustomerIntake = {
  id: number | string;
  customer_id: string | null;
  name: string | null;
  phone: string | null;
  birth_date: string | null;
  allergy: string | null;
  skin_trouble: string | null;
  constitution: string | null;
  avoid_items: string | null;
  signer_name: string | null;
  signature_data_url: string | null;
  check_health: boolean | null;
  check_reaction: boolean | null;
  check_refund: boolean | null;
  check_condition: boolean | null;
  check_photo: boolean | null;
  submitted_at: string | null;
  created_at?: string | null;
};

function formatPrice(value: number | null) {
  if (value === null || value === undefined) return "¥0";
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const normalized = value.trim().replace(/\//g, "-");
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("ja-JP");
}

function formatDateOnly(value: string | null) {
  if (!value) return "-";

  const normalized = value.trim().replace(/\//g, "-");
  const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (matched) {
    return `${matched[1]}/${Number(matched[2])}/${Number(matched[3])}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;

  return `${parsed.getFullYear()}/${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

function yesNo(value: boolean | null) {
  if (value === null) return "-";
  return value ? "確認済み" : "未確認";
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params?.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitPayments, setVisitPayments] = useState<VisitPayment[]>([]);
  const [intake, setIntake] = useState<CustomerIntake | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    fetchCustomerDetail();
  }, [customerId]);

  const paymentMap = useMemo(() => {
    const nextMap: Record<string, VisitPayment[]> = {};

    visitPayments.forEach((row) => {
      if (!nextMap[row.visit_id]) {
        nextMap[row.visit_id] = [];
      }
      nextMap[row.visit_id].push(row);
    });

    return nextMap;
  }, [visitPayments]);

  async function fetchCustomerDetail() {
    setLoading(true);

    try {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("id, name, name_kana, phone")
        .eq("id", customerId)
        .single();

      if (customerError) {
        console.error("customers取得エラー:", customerError);
        alert("顧客情報の取得に失敗しました");
        setLoading(false);
        return;
      }

      setCustomer(customerData);

      const { data: visitsData, error: visitsError } = await supabase
        .from("visits")
        .select(
          "id, customer_id, visit_date, price, payment_method, memo, next_visit_date, next_proposal"
        )
        .eq("customer_id", customerId)
        .order("visit_date", { ascending: false });

      if (visitsError) {
        console.error("visits取得エラー:", visitsError);
        setVisits([]);
        setVisitPayments([]);
      } else {
        const nextVisits = (visitsData || []) as Visit[];
        setVisits(nextVisits);

        const visitIds = nextVisits.map((visit) => visit.id).filter(Boolean);

        if (visitIds.length > 0) {
          const { data: paymentData, error: paymentError } = await supabase
            .from("visit_payments")
            .select("id, visit_id, payment_method, amount, sort_order")
            .in("visit_id", visitIds)
            .order("sort_order", { ascending: true });

          if (paymentError) {
            console.error("visit_payments取得エラー:", paymentError);
            setVisitPayments([]);
          } else {
            setVisitPayments((paymentData || []) as VisitPayment[]);
          }
        } else {
          setVisitPayments([]);
        }
      }

      try {
        const intakeRes = await supabase
          .from("customer_intakes")
          .select("*")
          .eq("customer_id", customerId);

        if (intakeRes.error) {
          console.error("customer_intakes取得エラー:", intakeRes.error);
          console.error(
            "customer_intakes取得エラー詳細:",
            JSON.stringify(intakeRes.error, null, 2)
          );
          setIntake(null);
        } else {
          const intakeRows = ((intakeRes.data || []) as any[])
            .filter((item) => item && item.customer_id)
            .map((item) => ({
              id: item.id,
              customer_id: item.customer_id ?? null,
              name: typeof item.name === "string" ? item.name : null,
              phone: typeof item.phone === "string" ? item.phone : null,
              birth_date:
                typeof item.birth_date === "string" ? item.birth_date : null,
              allergy: typeof item.allergy === "string" ? item.allergy : null,
              skin_trouble:
                typeof item.skin_trouble === "string"
                  ? item.skin_trouble
                  : null,
              constitution:
                typeof item.constitution === "string"
                  ? item.constitution
                  : null,
              avoid_items:
                typeof item.avoid_items === "string" ? item.avoid_items : null,
              signer_name:
                typeof item.signer_name === "string" ? item.signer_name : null,
              signature_data_url:
                typeof item.signature_data_url === "string"
                  ? item.signature_data_url
                  : null,
              check_health:
                typeof item.check_health === "boolean"
                  ? item.check_health
                  : null,
              check_reaction:
                typeof item.check_reaction === "boolean"
                  ? item.check_reaction
                  : null,
              check_refund:
                typeof item.check_refund === "boolean"
                  ? item.check_refund
                  : null,
              check_condition:
                typeof item.check_condition === "boolean"
                  ? item.check_condition
                  : null,
              check_photo:
                typeof item.check_photo === "boolean" ? item.check_photo : null,
              submitted_at:
                typeof item.submitted_at === "string" ? item.submitted_at : null,
              created_at:
                typeof item.created_at === "string" ? item.created_at : null,
            })) as CustomerIntake[];

          const latestIntake =
            intakeRows.sort((a, b) => {
              const aTime = a.created_at
                ? new Date(a.created_at).getTime()
                : a.submitted_at
                ? new Date(a.submitted_at).getTime()
                : 0;
              const bTime = b.created_at
                ? new Date(b.created_at).getTime()
                : b.submitted_at
                ? new Date(b.submitted_at).getTime()
                : 0;
              return bTime - aTime;
            })[0] || null;

          setIntake(latestIntake);
        }
      } catch (error) {
        console.error("customer_intakes想定外エラー:", error);
        setIntake(null);
      }
    } catch (error) {
      console.error("詳細取得エラー:", error);
      alert("データ取得中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCustomer() {
    const ok = window.confirm("この顧客を削除しますか？");
    if (!ok) return;

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", customerId);

    if (error) {
      console.error("顧客削除エラー:", error);
      alert("顧客の削除に失敗しました");
      return;
    }

    alert("顧客を削除しました");
    router.push("/customers");
  }

  function formatPaymentSummary(visit: Visit) {
    const rows = paymentMap[visit.id] ?? [];

    if (rows.length === 0) {
      return visit.payment_method || "未設定";
    }

    if (rows.length === 1) {
      const row = rows[0];
      return `${row.payment_method} ${formatPrice(row.amount)}`;
    }

    return rows
      .map((row) => `${row.payment_method} ${formatPrice(row.amount)}`)
      .join(" / ");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-rose-50/40">
        <div className="mx-auto max-w-[920px] p-4 pb-24">
          <div className="rounded-[28px] border border-rose-100 bg-white p-4 text-sm text-gray-500 shadow-sm">
            読み込み中...
          </div>
        </div>
      </main>
    );
  }

  if (!customer) {
    return (
      <main className="min-h-screen bg-rose-50/40">
        <div className="mx-auto max-w-[920px] p-4 pb-24">
          <div className="rounded-[28px] border border-rose-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
            顧客情報が見つかりません
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-[920px] space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">顧客詳細ページ</h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                お客様情報、初回カウンセリング、来店履歴をまとめて確認できます。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push("/customers")}
                className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
              >
                顧客ページへ
              </button>

              <Link
                href={`/customers/${customerId}/edit`}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-rose-500 shadow"
              >
                編集
              </Link>

              <button
                onClick={handleDeleteCustomer}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
              >
                削除
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <div className="text-lg font-bold text-slate-900">{customer.name}</div>
            <div className="mt-1 text-sm text-slate-500">
              基本情報を確認できます。
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl bg-rose-50 p-4">
              <div className="text-xs text-slate-500">お名前</div>
              <div className="mt-2 text-base font-bold text-slate-900">
                {customer.name || "-"}
              </div>
            </div>

            <div className="rounded-3xl bg-rose-50 p-4">
              <div className="text-xs text-slate-500">フリガナ</div>
              <div className="mt-2 text-base font-bold text-slate-900">
                {customer.name_kana || "-"}
              </div>
            </div>

            <div className="rounded-3xl bg-rose-50 p-4">
              <div className="text-xs text-slate-500">電話番号</div>
              <div className="mt-2 text-base font-bold text-slate-900">
                {customer.phone || "-"}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <h2 className="text-lg font-bold text-slate-900">初回カウンセリング</h2>
            <p className="mt-1 text-sm text-slate-500">
              初回来店時の確認内容や署名情報をまとめています。
            </p>
          </div>

          {intake ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-3xl bg-rose-50 p-4">
                  <p className="font-semibold text-slate-700">アレルギー情報</p>
                  <div className="mt-2 whitespace-pre-wrap rounded-2xl bg-white p-3 text-slate-700">
                    {intake.allergy || "-"}
                  </div>
                </div>

                <div className="rounded-3xl bg-rose-50 p-4">
                  <p className="font-semibold text-slate-700">皮膚トラブル</p>
                  <div className="mt-2 whitespace-pre-wrap rounded-2xl bg-white p-3 text-slate-700">
                    {intake.skin_trouble || "-"}
                  </div>
                </div>

                <div className="rounded-3xl bg-rose-50 p-4">
                  <p className="font-semibold text-slate-700">体質</p>
                  <div className="mt-2 whitespace-pre-wrap rounded-2xl bg-white p-3 text-slate-700">
                    {intake.constitution || "-"}
                  </div>
                </div>

                <div className="rounded-3xl bg-rose-50 p-4">
                  <p className="font-semibold text-slate-700">
                    施術NG項目・避けてほしいこと
                  </p>
                  <div className="mt-2 whitespace-pre-wrap rounded-2xl bg-white p-3 text-slate-700">
                    {intake.avoid_items || "-"}
                  </div>
                </div>

                <div className="rounded-3xl bg-rose-50 p-4">
                  <p className="font-semibold text-slate-700">初回記録のお名前</p>
                  <div className="mt-2 rounded-2xl bg-white p-3 text-slate-700">
                    {intake.name || "-"}
                  </div>
                </div>

                <div className="rounded-3xl bg-rose-50 p-4">
                  <p className="font-semibold text-slate-700">初回記録の電話番号</p>
                  <div className="mt-2 rounded-2xl bg-white p-3 text-slate-700">
                    {intake.phone || "-"}
                  </div>
                </div>

                <div className="rounded-3xl bg-rose-50 p-4">
                  <p className="font-semibold text-slate-700">生年月日</p>
                  <div className="mt-2 rounded-2xl bg-white p-3 text-slate-700">
                    {formatDate(intake.birth_date)}
                  </div>
                </div>

                <div className="rounded-3xl bg-rose-50 p-4">
                  <p className="font-semibold text-slate-700">署名者名</p>
                  <div className="mt-2 rounded-2xl bg-white p-3 text-slate-700">
                    {intake.signer_name || "-"}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-rose-50 p-4">
                <p className="font-semibold text-slate-700">注意事項確認</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="rounded-2xl bg-white p-3 text-slate-700">
                    体調不良・感染症など: {yesNo(intake.check_health)}
                  </div>
                  <div className="rounded-2xl bg-white p-3 text-slate-700">
                    反応リスク確認: {yesNo(intake.check_reaction)}
                  </div>
                  <div className="rounded-2xl bg-white p-3 text-slate-700">
                    返金ポリシー確認: {yesNo(intake.check_refund)}
                  </div>
                  <div className="rounded-2xl bg-white p-3 text-slate-700">
                    持病・妊娠・服薬申告: {yesNo(intake.check_condition)}
                  </div>
                  <div className="rounded-2xl bg-white p-3 text-slate-700 md:col-span-2">
                    写真撮影確認: {yesNo(intake.check_photo)}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-rose-50 p-4">
                <p className="font-semibold text-slate-700">署名</p>
                <div className="mt-2 rounded-2xl bg-white p-3">
                  {intake.signature_data_url ? (
                    <img
                      src={intake.signature_data_url}
                      alt="署名"
                      className="max-h-64 w-full rounded-2xl border bg-white object-contain"
                    />
                  ) : (
                    <div className="text-slate-500">-</div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl bg-rose-50 p-4">
                <p className="font-semibold text-slate-700">送信日時</p>
                <div className="mt-2 rounded-2xl bg-white p-3 text-slate-700">
                  {formatDate(intake.submitted_at)}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl bg-rose-50 p-4 text-sm text-slate-500">
              初回カウンセリング情報はまだ登録されていません
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">来店履歴</h2>
              <p className="mt-1 text-sm text-slate-500">
                来店日や売上、次回来店予定を確認できます。
              </p>
            </div>

            <Link
              href={`/visits/new?customer_id=${customerId}`}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
            >
              来店履歴を追加
            </Link>
          </div>

          {visits.length === 0 ? (
            <div className="rounded-3xl bg-rose-50 p-4 text-sm text-slate-500">
              来店履歴はまだありません
            </div>
          ) : (
            <div className="space-y-3">
              {visits.map((visit) => (
                <div
                  key={visit.id}
                  className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-base font-bold text-slate-900">
                        来店日 {formatDateOnly(visit.visit_date)}
                      </div>
                      <div className="text-sm text-slate-500">
                        次回の提案やお会計内容も確認できます。
                      </div>
                    </div>

                    <Link
                      href={`/visits/${visit.id}/edit`}
                      className="shrink-0 rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-600"
                    >
                      編集
                    </Link>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-slate-700">
                    <div>
                      <span className="font-medium">売上:</span>{" "}
                      {formatPrice(visit.price)}
                    </div>

                    <div>
                      <span className="font-medium">支払い方法:</span>{" "}
                      {visit.payment_method || "未設定"}
                    </div>

                    <div>
                      <span className="font-medium">支払い内訳:</span>{" "}
                      {formatPaymentSummary(visit)}
                    </div>

                    <div>
                      <span className="font-medium">メモ:</span>{" "}
                      {visit.memo?.trim() ? visit.memo : "-"}
                    </div>

                    <div>
                      <span className="font-medium">次回来店予定:</span>{" "}
                      {formatDateOnly(visit.next_visit_date)}
                    </div>

                    <div>
                      <span className="font-medium">次回提案:</span>{" "}
                      {visit.next_proposal?.trim() ? visit.next_proposal : "-"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}